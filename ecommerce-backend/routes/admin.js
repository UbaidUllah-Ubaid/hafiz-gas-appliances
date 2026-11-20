import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import asyncHandler from '../middleware/async-handler.js';

const router = express.Router();
router.use(requireAdmin);

const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
const pageArgs = req => ({
  page: Math.max(1, parseInt(req.query.page || '1', 10) || 1),
  limit: Math.max(1, Math.min(100, parseInt(req.query.limit || '25', 10) || 25))
});
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(
    null,
    `${Date.now()}-${randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`
  )
});

const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
    files: 8
  },
  fileFilter: (_req, file, cb) => cb(
    null,
    ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)
  )
});


router.get('/reviews', asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req);
  const totalResult = await db.query('SELECT COUNT(*)::INTEGER AS count FROM reviews');
  const result = await db.query(`
    SELECT r.id, r.product_id, p.title AS product_title,
           r.user_id, u.name AS user_name, u.email AS user_email,
           r.rating, r.comment, r.created_at
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN users u ON u.id = r.user_id
    ORDER BY r.id DESC
    LIMIT $1 OFFSET $2
  `, [limit, (page - 1) * limit]);
  res.json({
    data: result.rows,
    pagination: { page, limit, total: totalResult.rows[0].count,
      totalPages: Math.ceil(totalResult.rows[0].count / limit) }
  });
}));

router.delete('/reviews/:id', asyncHandler(async (req, res) => {
  const result = await db.query('DELETE FROM reviews WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Review not found' });
  res.json({ message: 'Review deleted successfully' });
}));

router.get('/dashboard-stats', asyncHandler(async (_req, res) => {
  const result = await db.query(`
    SELECT
      (SELECT COUNT(*)::INTEGER FROM products) AS total_products,
      (SELECT COUNT(*)::INTEGER FROM products WHERE stock = 0) AS out_of_stock,
      (SELECT COUNT(*)::INTEGER FROM products WHERE stock > 0 AND stock <= 5) AS low_stock,
      (SELECT COUNT(*)::INTEGER FROM orders) AS total_orders,
      (SELECT COUNT(*)::INTEGER FROM orders WHERE status = 'pending') AS pending_orders,
      (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status <> 'cancelled') AS total_revenue,
      (SELECT COUNT(*)::INTEGER FROM users WHERE role = 'user') AS total_users
  `);
  const row = result.rows[0];
  res.json({
    products: {
      totalProducts: row.total_products,
      outOfStock: row.out_of_stock,
      lowStock: row.low_stock
    },
    orders: {
      totalOrders: row.total_orders,
      pendingOrders: row.pending_orders,
      totalRevenue: Number(row.total_revenue)
    },
    users: { totalUsers: row.total_users }
  });
}));

router.get('/orders', asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req);
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status && !statuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status' });
  }

  const where = status ? 'WHERE o.status = $1' : '';
  const filterParams = status ? [status] : [];
  const totalResult = await db.query(
    `SELECT COUNT(*)::INTEGER AS count FROM orders o ${where}`,
    filterParams
  );
  const limitIndex = filterParams.length + 1;
  const ordersResult = await db.query(`
    SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ${where}
    ORDER BY o.id DESC
    LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
  `, [...filterParams, limit, (page - 1) * limit]);

  const data = await Promise.all(ordersResult.rows.map(async order => {
    const itemsResult = await db.query(`
      SELECT oi.*, COALESCE(oi.product_title, p.title) AS title, p.sku
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1
    `, [order.id]);
    return {
      ...order,
      items: itemsResult.rows.map(item => ({
        ...item,
        selected_options: parseJson(item.selected_options)
      }))
    };
  }));

  res.json({
    data,
    pagination: {
      page,
      limit,
      total: totalResult.rows[0].count,
      totalPages: Math.ceil(totalResult.rows[0].count / limit)
    }
  });
}));

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

router.put('/orders/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!statuses.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${statuses.join(', ')}` });
  }

  const client = await db.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ error: 'Order not found' });
    }

    const transitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped', 'cancelled'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: []
    };

    if (
      order.status !== status &&
      !transitions[order.status]?.includes(status)
    ) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({
        error: `Cannot change order status from ${order.status} to ${status}`
      });
    }

    if (order.status === status) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.json({ message: 'Order status unchanged', status });
    }

    if (status === 'cancelled') {
      const items = await client.query(
        'SELECT product_id, quantity FROM order_items WHERE order_id = $1',
        [order.id]
      );
      for (const item of items.rows) {
        await client.query(
          `UPDATE products
           SET stock = stock + $1,
               updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
           WHERE id = $2`,
          [item.quantity, item.product_id]
        );
      }
    }

    await client.query(
      `UPDATE orders
       SET status = $1,
           updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = $2`,
      [status, order.id]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({ message: 'Order status updated', status });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/contacts', asyncHandler(async (req, res) => {
  const { page, limit } = pageArgs(req);
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  if (status && !['new', 'read', 'replied', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid contact status' });
  }

  const where = status ? 'WHERE status = $1' : '';
  const filterParams = status ? [status] : [];
  const totalResult = await db.query(
    `SELECT COUNT(*)::INTEGER AS count FROM contact_messages ${where}`,
    filterParams
  );
  const limitIndex = filterParams.length + 1;
  const data = await db.query(`
    SELECT * FROM contact_messages ${where}
    ORDER BY id DESC
    LIMIT $${limitIndex} OFFSET $${limitIndex + 1}
  `, [...filterParams, limit, (page - 1) * limit]);

  res.json({
    data: data.rows,
    pagination: {
      page,
      limit,
      total: totalResult.rows[0].count,
      totalPages: Math.ceil(totalResult.rows[0].count / limit)
    }
  });
}));

router.patch('/contacts/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'read', 'replied', 'closed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid contact status' });
  }

  const result = await db.query(
    `UPDATE contact_messages
     SET status = $1, updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $2`,
    [status, req.params.id]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: 'Contact message not found' });
  }
  res.json({ message: 'Contact status updated', status });
}));

router.post(
  '/uploads',
  (req, res, next) => upload.array('images', 8)(req, res, error => {
    if (error) {
      return res.status(400).json({
        error: error.code === 'LIMIT_FILE_SIZE'
          ? 'Image exceeds the configured size limit'
          : error.message || 'Upload failed'
      });
    }
    next();
  }),
  (req, res) => {
    if (!req.files?.length) {
      return res.status(400).json({
        error: 'Upload at least one valid image using the images field'
      });
    }
    const base = `${req.protocol}://${req.get('host')}`;
    res.status(201).json({
      images: req.files.map(file => ({
        url: `${base}/uploads/${encodeURIComponent(file.filename)}`,
        filename: file.filename,
        size: file.size,
        mimeType: file.mimetype
      }))
    });
  }
);

export default router;
