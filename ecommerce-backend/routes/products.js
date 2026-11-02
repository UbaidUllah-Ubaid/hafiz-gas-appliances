import express from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const router = express.Router();

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extensions = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };

    cb(
      null,
      `${crypto.randomUUID()}${extensions[file.mimetype] || ''}`
    );
  },
});

const allowedImageTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const imageUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    if (!allowedImageTypes.includes(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG, WEBP and GIF images are allowed')
      );
    }

    cb(null, true);
  },
});

function parseImages(product) {
  try {
    const parsed = JSON.parse(product.images || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const getOptions = db.prepare(`
  SELECT id, option_group, option_value, extra_price
  FROM product_options
  WHERE product_id = ?
  ORDER BY id
`);

function productShape(product, includeReviews = false) {
  const shaped = {
    ...product,
    price: Number(product.price),
    stock: Number(product.stock),
    is_published: Boolean(product.is_published),
    images: parseImages(product),
    options: getOptions.all(product.id).map(option => ({
      ...option,
      extra_price: Number(option.extra_price || 0),
    })),
  };

  if (includeReviews) {
    shaped.reviews = db.prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at,
             u.name AS user_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.product_id = ?
      ORDER BY r.id DESC
    `).all(product.id);
  }

  return shaped;
}

function normalizeImages(body) {
  if (body.images !== undefined) {
    if (
      !Array.isArray(body.images) ||
      body.images.length > 10 ||
      body.images.some(
        image => typeof image !== 'string' || !image.trim()
      )
    ) {
      return null;
    }

    return body.images.map(image => image.trim());
  }

  if (typeof body.image_url === 'string' && body.image_url.trim()) {
    return [body.image_url.trim()];
  }

  return [];
}

function validateProduct(body) {
  const errors = [];

  for (const key of ['title', 'sku', 'description']) {
    if (
      typeof body[key] !== 'string' ||
      !body[key].trim() ||
      body[key].trim().length >
        (key === 'description' ? 10000 : 200)
    ) {
      errors.push(
        `${key} is required and must be a valid string`
      );
    }
  }

  if (
    !Number.isFinite(Number(body.price)) ||
    Number(body.price) <= 0 ||
    Number(body.price) > 100000000
  ) {
    errors.push('price must be a positive number');
  }

  if (
    !Number.isInteger(Number(body.stock)) ||
    Number(body.stock) < 0 ||
    Number(body.stock) > 100000000
  ) {
    errors.push('stock must be a non-negative integer');
  }

  if (
    body.category !== undefined &&
    body.category !== null &&
    typeof body.category !== 'string'
  ) {
    errors.push('category must be a string');
  }

  if (body.options !== undefined) {
    if (
      !Array.isArray(body.options) ||
      body.options.length > 100 ||
      body.options.some(option =>
        !option ||
        typeof option.option_group !== 'string' ||
        !option.option_group.trim() ||
        typeof option.option_value !== 'string' ||
        !option.option_value.trim() ||
        !Number.isFinite(Number(option.extra_price ?? 0)) ||
        Number(option.extra_price ?? 0) < 0
      )
    ) {
      errors.push('Invalid product options');
    } else {
      const gasOptions = body.options.filter(
        option => option.option_group.trim().toLowerCase() === 'gas type'
      );

      const validGasValues = ['sui gas', 'lpg'];

      if (
        gasOptions.some(
          option =>
            !validGasValues.includes(
              option.option_value.trim().toLowerCase()
            )
        ) ||
        new Set(
          gasOptions.map(option =>
            option.option_value.trim().toLowerCase()
          )
        ).size !== gasOptions.length
      ) {
        errors.push(
          'Gas Type options must be unique Sui Gas and/or LPG values'
        );
      }
    }
  }

  const images = normalizeImages(body);

  if (images === null) {
    errors.push('images must be an array of up to 10 image URLs');
  }

  return errors;
}

function saveOptions(productId, options) {
  db.prepare(
    'DELETE FROM product_options WHERE product_id = ?'
  ).run(productId);

  const insert = db.prepare(`
    INSERT INTO product_options
      (product_id, option_group, option_value, extra_price)
    VALUES (?, ?, ?, ?)
  `);

  for (const option of options || []) {
    insert.run(
      productId,
      option.option_group.trim(),
      option.option_value.trim(),
      Number(option.extra_price ?? 0)
    );
  }
}

/* SINGLE IMAGE UPLOAD — preserves existing frontend */
router.post('/upload', requireAdmin, (req, res, next) => {
  imageUpload.single('image')(req, res, err => {
    if (err) {
      return res.status(400).json({
        error: err.message || 'Image upload failed',
      });
    }

    next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Please select an image',
    });
  }

  const imageUrl = `/uploads/${req.file.filename}`;

  res.status(201).json({
    message: 'Image uploaded successfully',
    image_url: imageUrl,
    url: imageUrl,
  });
});

/* MULTIPLE IMAGE UPLOAD */
router.post(
  '/upload-multiple',
  requireAdmin,
  (req, res, next) => {
    imageUpload.array('images', 10)(req, res, err => {
      if (err) {
        return res.status(400).json({
          error: err.message || 'Image upload failed',
        });
      }

      next();
    });
  },
  (req, res) => {
    const files = req.files || [];

    if (files.length === 0) {
      return res.status(400).json({
        error: 'Please select at least one image',
      });
    }

    const images = files.map(
      file => `/uploads/${file.filename}`
    );

    res.status(201).json({
      message: 'Images uploaded successfully',
      images,
      main_image: images[0],
    });
  }
);

/* GET ALL PUBLISHED PRODUCTS */
router.get('/', (req, res) => {
  const page = Math.max(
    1,
    parseInt(req.query.page || '1', 10) || 1
  );

  const limit = Math.max(
    1,
    Math.min(
      100,
      parseInt(req.query.limit || '24', 10) || 24
    )
  );

  const where = ['is_published = 1'];
  const params = [];

  const search = typeof req.query.search === 'string'
    ? req.query.search.trim().slice(0, 100)
    : '';

  const category = typeof req.query.category === 'string'
    ? req.query.category.trim().slice(0, 100)
    : '';

  if (search) {
    where.push(
      '(title LIKE ? OR description LIKE ? OR sku LIKE ?)'
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    where.push('category = ?');
    params.push(category);
  }

  const sortMap = {
    newest: 'id DESC',
    price_asc: 'price ASC, id DESC',
    price_desc: 'price DESC, id DESC',
    title: 'title COLLATE NOCASE ASC',
  };

  const sort = sortMap[req.query.sort] || sortMap.newest;

  const total = db.prepare(`
    SELECT COUNT(*) AS count
    FROM products
    WHERE ${where.join(' AND ')}
  `).get(...params).count;

  const rows = db.prepare(`
    SELECT *
    FROM products
    WHERE ${where.join(' AND ')}
    ORDER BY ${sort}
    LIMIT ? OFFSET ?
  `).all(...params, limit, (page - 1) * limit);

  res.json({
    data: rows.map(product => productShape(product)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/* GET ALL PRODUCTS FOR ADMIN — INCLUDING UNPUBLISHED */
router.get('/admin/all', requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT * FROM products
    ORDER BY id DESC
  `).all();

  res.json({
    data: products.map(product => productShape(product))
  });
});

/* GET ONE PUBLISHED PRODUCT */
router.get('/:id', (req, res) => {
  const product = db.prepare(`
    SELECT *
    FROM products
    WHERE id = ? AND is_published = 1
  `).get(req.params.id);

  if (!product) {
    return res.status(404).json({
      error: 'Product not found',
    });
  }

  res.json(productShape(product, true));
});

/* CREATE PRODUCT */
router.post('/', requireAdmin, (req, res, next) => {
  try {
    const body = req.body || {};
    const errors = validateProduct(body);

    if (errors.length) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    const images = normalizeImages(body);
    const mainImage = images[0] || null;

    const result = db.prepare(`
      INSERT INTO products
        (title, sku, description, price, stock, image_url,
         images, category, is_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      body.title.trim(),
      body.sku.trim(),
      body.description.trim(),
      Number(body.price),
      Number(body.stock),
      mainImage,
      JSON.stringify(images),
      typeof body.category === 'string'
        ? body.category.trim()
        : null,
      body.is_published === false ||
      body.is_published === 0 ||
      body.is_published === 'false'
        ? 0
        : 1
    );

    const productId = Number(result.lastInsertRowid);

    saveOptions(productId, body.options || []);

    const product = db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).get(productId);

    res.status(201).json({
      message: 'Product created successfully',
      product: productShape(product),
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({
        error: 'SKU already exists',
      });
    }

    next(err);
  }
});

/* UPDATE PRODUCT */
router.put('/:id', requireAdmin, (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Invalid product ID',
      });
    }

    const existing = db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).get(id);

    if (!existing) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    const body = req.body || {};
    const merged = { ...existing, ...body };

    if (body.images === undefined && body.image_url === undefined) {
      merged.images = parseImages(existing);
      merged.image_url = existing.image_url;
    }

    const errors = validateProduct(merged);

    if (errors.length) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
    }

    const images = normalizeImages(merged);
    const mainImage = images[0] || null;

    db.exec('BEGIN IMMEDIATE');

    try {
      db.prepare(`
        UPDATE products
        SET title = ?, sku = ?, description = ?, price = ?,
            stock = ?, image_url = ?, images = ?, category = ?,
            is_published = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        merged.title.trim(),
        merged.sku.trim(),
        merged.description.trim(),
        Number(merged.price),
        Number(merged.stock),
        mainImage,
        JSON.stringify(images),
        merged.category ?? existing.category,
        merged.is_published === false ||
        merged.is_published === 0 ||
        merged.is_published === 'false'
          ? 0
          : 1,
        id
      );

      if (body.options !== undefined) {
        saveOptions(id, body.options);
      }

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    const product = db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).get(id);

    res.json({
      message: 'Product updated successfully',
      product: productShape(product),
    });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({
        error: 'SKU already exists',
      });
    }

    next(err);
  }
});

/* DELETE PRODUCT */
router.delete('/:id', requireAdmin, (req, res, next) => {
  const id = Number(req.params.id);

  try {
    const result = db.prepare(
      'DELETE FROM products WHERE id = ?'
    ).run(id);

    if (!result.changes) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    res.json({
      message: 'Product deleted successfully',
    });
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      return res.status(409).json({
        error: 'Product has order history and cannot be deleted.',
      });
    }

    next(err);
  }
});

export default router;
