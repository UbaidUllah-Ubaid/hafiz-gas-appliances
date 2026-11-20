import express from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import asyncHandler from '../middleware/async-handler.js';

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

async function productShape(product, includeReviews = false) {
  const ratingResult = await db.query(`
    SELECT ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*)::INTEGER AS review_count
    FROM reviews WHERE product_id = $1
  `, [product.id]);
  const averageRating = ratingResult.rows[0].average_rating === null
    ? null : Number(ratingResult.rows[0].average_rating);
  const reviewCount = Number(ratingResult.rows[0].review_count || 0);
  const options = await db.query(`
    SELECT id, option_group, option_value, extra_price
    FROM product_options
    WHERE product_id = $1
    ORDER BY id
  `, [product.id]);
  const shaped = {
    ...product,
    price: Number(product.price),
    stock: Number(product.stock),
    is_published: Boolean(product.is_published),
    images: parseImages(product),
    options: options.rows.map(option => ({
      ...option,
      extra_price: Number(option.extra_price || 0),
    })),
    average_rating: averageRating,
    review_count: reviewCount,
    show_rating: averageRating !== null && averageRating >= 4 && reviewCount >= 3,
  };

  if (includeReviews) {
    const reviews = await db.query(`
      SELECT r.id, r.rating, r.comment, r.created_at,
             u.name AS user_name
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      WHERE r.product_id = $1
      ORDER BY r.id DESC
    `, [product.id]);
    shaped.reviews = reviews.rows;
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

async function saveOptions(client, productId, options) {
  await client.query('DELETE FROM product_options WHERE product_id = $1', [productId]);

  for (const option of options || []) {
    await client.query(`
      INSERT INTO product_options
        (product_id, option_group, option_value, extra_price)
      VALUES ($1, $2, $3, $4)
    `, [
      productId,
      option.option_group.trim(),
      option.option_value.trim(),
      Number(option.extra_price ?? 0)
    ]);
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
router.get('/', asyncHandler(async (req, res) => {
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
    const firstSearchParam = params.length + 1;
    where.push(
      `(title ILIKE $${firstSearchParam} OR description ILIKE $${firstSearchParam + 1} OR sku ILIKE $${firstSearchParam + 2})`
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    where.push(`category = $${params.length + 1}`);
    params.push(category);
  }

  const sortMap = {
    newest: 'id DESC',
    price_asc: 'price ASC, id DESC',
    price_desc: 'price DESC, id DESC',
    title: 'LOWER(title) ASC',
  };

  const sort = sortMap[req.query.sort] || sortMap.newest;

  const totalResult = await db.query(`
    SELECT COUNT(*)::INTEGER AS count
    FROM products
    WHERE ${where.join(' AND ')}
  `, params);

  const limitIndex = params.length + 1;
  const rows = await db.query(`
    SELECT *
    FROM products
    WHERE ${where.join(' AND ')}
    ORDER BY ${sort}
    LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
  `, [...params, limit, (page - 1) * limit]);

  res.json({
    data: await Promise.all(rows.rows.map(product => productShape(product))),
    pagination: {
      page,
      limit,
      total: totalResult.rows[0].count,
      totalPages: Math.ceil(totalResult.rows[0].count / limit),
    },
  });
}));

/* GET ALL PRODUCTS FOR ADMIN — INCLUDING UNPUBLISHED */
router.get('/admin/all', requireAdmin, asyncHandler(async (_req, res) => {
  const products = await db.query(`
    SELECT * FROM products
    ORDER BY id DESC
  `);

  res.json({
    data: await Promise.all(products.rows.map(product => productShape(product)))
  });
}));

/* GET ONE PUBLISHED PRODUCT */
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await db.query(`
    SELECT *
    FROM products
    WHERE id = $1 AND is_published = 1
  `, [req.params.id]);
  const product = result.rows[0];

  if (!product) {
    return res.status(404).json({
      error: 'Product not found',
    });
  }

  res.json(await productShape(product, true));
}));

/* CREATE PRODUCT */
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
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

    const client = await db.connect();
    let transactionStarted = false;
    let product;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      const result = await client.query(`
        INSERT INTO products
          (title, sku, description, price, stock, image_url,
           images, category, is_published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `, [
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
      ]);

      const productId = result.rows[0].id;
      await saveOptions(client, productId, body.options || []);
      const savedProduct = await client.query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );
      product = savedProduct.rows[0];
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    res.status(201).json({
      message: 'Product created successfully',
      product: await productShape(product),
    });
}, (error, _req, res, next) => {
  if (error.code === '23505') {
    return res.status(409).json({ error: 'SKU already exists' });
  }
  next(error);
}));

/* UPDATE PRODUCT */
router.put('/:id', requireAdmin, asyncHandler(async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: 'Invalid product ID',
      });
    }

    const existingResult = await db.query(
      'SELECT * FROM products WHERE id = $1',
      [id]
    );
    const existing = existingResult.rows[0];

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

    const client = await db.connect();
    let transactionStarted = false;
    let product;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query(`
        UPDATE products
        SET title = $1, sku = $2, description = $3, price = $4,
            stock = $5, image_url = $6, images = $7, category = $8,
            is_published = $9,
            updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
        WHERE id = $10
      `, [
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
      ]);

      if (body.options !== undefined) {
        await saveOptions(client, id, body.options);
      }

      const savedProduct = await client.query(
        'SELECT * FROM products WHERE id = $1',
        [id]
      );
      product = savedProduct.rows[0];
      await client.query('COMMIT');
      transactionStarted = false;
    } catch (err) {
      if (transactionStarted) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      client.release();
    }

    res.json({
      message: 'Product updated successfully',
      product: await productShape(product),
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'SKU already exists',
      });
    }

    next(err);
  }
}));

/* DELETE PRODUCT */
router.delete('/:id', requireAdmin, asyncHandler(async (req, res, next) => {
  const id = Number(req.params.id);

  try {
    const result = await db.query('DELETE FROM products WHERE id = $1', [id]);

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Product not found',
      });
    }

    res.json({
      message: 'Product deleted successfully',
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Product has order history and cannot be deleted.',
      });
    }

    next(err);
  }
}));

export default router;
