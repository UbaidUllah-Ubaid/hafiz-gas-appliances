import express from 'express';
import db from '../db.js';
import {
  authenticateToken,
  requireAdmin
} from '../middleware/auth.js';
import asyncHandler from '../middleware/async-handler.js';

const router = express.Router();

const cents = value => Math.round(Number(value) * 100);

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function clean(value, max) {
  if (value === undefined || value === null || typeof value !== 'string') {
    return null;
  }
  return value.trim().slice(0, max) || null;
}

async function orderWithItems(order) {
  const result = await db.query(`
    SELECT
      oi.*,
      COALESCE(oi.product_title, p.title) AS title,
      p.sku
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = $1
  `, [order.id]);

  return {
    ...order,
    items: result.rows.map(item => ({
      ...item,
      selected_options: safeJson(item.selected_options, {})
    }))
  };
}

router.post('/', authenticateToken, asyncHandler(async (req, res) => {
  const {
    items,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    notes
  } = req.body || {};

  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return res.status(400).json({
      error: 'Order must contain between 1 and 100 items'
    });
  }

  const invalidItem = items.some(item =>
    !item ||
    !Number.isInteger(Number(item.product_id)) ||
    Number(item.product_id) < 1 ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    item.quantity > 1000 ||
    (
      item.selected_options !== undefined &&
      (
        !item.selected_options ||
        typeof item.selected_options !== 'object' ||
        Array.isArray(item.selected_options)
      )
    )
  );
  if (invalidItem) {
    return res.status(400).json({
      error: 'Each item needs a valid product_id, quantity and selected_options'
    });
  }

  if (
    shipping_address !== undefined &&
    (
      typeof shipping_address !== 'string' ||
      shipping_address.trim().length > 2000
    )
  ) {
    return res.status(400).json({ error: 'Invalid shipping address' });
  }

  const idempotencyKey =
    typeof req.headers['idempotency-key'] === 'string'
      ? req.headers['idempotency-key'].trim()
      : '';
  if (
    idempotencyKey &&
    (
      idempotencyKey.length > 128 ||
      !/^[\w.:-]+$/.test(idempotencyKey)
    )
  ) {
    return res.status(400).json({ error: 'Invalid Idempotency-Key header' });
  }

  if (idempotencyKey) {
    const previousResult = await db.query(`
      SELECT o.*
      FROM idempotency_keys k
      JOIN orders o ON o.id = k.order_id
      WHERE k.key = $1 AND k.user_id = $2
    `, [idempotencyKey, req.user.id]);
    if (previousResult.rowCount) {
      return res.status(200).json({
        message: 'Order already created for this idempotency key',
        ...await orderWithItems(previousResult.rows[0])
      });
    }
  }

  const mergedItems = new Map();
  for (const item of items) {
    const options = item.selected_options || {};
    const key = `${item.product_id}:${JSON.stringify(options)}`;
    const existing = mergedItems.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      mergedItems.set(key, {
        ...item,
        product_id: Number(item.product_id),
        selected_options: options
      });
    }
  }

  const preparedItems = [];
  let totalCents = 0;
  for (const item of mergedItems.values()) {
    const productResult = await db.query(`
      SELECT *
      FROM products
      WHERE id = $1 AND is_published = 1
    `, [item.product_id]);
    const product = productResult.rows[0];
    if (!product) {
      return res.status(404).json({
        error: `Product ID ${item.product_id} not found or unavailable`
      });
    }
    if (Number(product.stock) < item.quantity) {
      return res.status(409).json({
        error: `Insufficient stock for product: ${product.title}`
      });
    }

    const optionsResult = await db.query(`
      SELECT option_group, option_value, extra_price
      FROM product_options
      WHERE product_id = $1
    `, [product.id]);
    let extraCents = 0;
    for (const [group, value] of Object.entries(item.selected_options)) {
      const match = optionsResult.rows.find(option =>
        option.option_group.trim().toLowerCase() === group.trim().toLowerCase() &&
        option.option_value.trim().toLowerCase() === String(value).trim().toLowerCase()
      );
      if (!match) {
        return res.status(400).json({
          error: `Invalid option ${group}: ${String(value)} for ${product.title}`
        });
      }
      extraCents += cents(match.extra_price);
    }

    const unitCents = cents(product.price) + extraCents;
    totalCents += unitCents * item.quantity;
    preparedItems.push({
      product,
      quantity: item.quantity,
      unitPrice: unitCents / 100,
      selected_options: item.selected_options
    });
  }

  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents < 0 ||
    totalCents > 100000000000
  ) {
    return res.status(400).json({
      error: 'Order total is outside the permitted range'
    });
  }

  const client = await db.connect();
  let transactionStarted = false;
  let orderId;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const orderResult = await client.query(`
      INSERT INTO orders (
        user_id, total_price, customer_name, customer_email,
        customer_phone, shipping_address, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      req.user.id,
      totalCents / 100,
      clean(customer_name, 100),
      clean(customer_email, 254),
      clean(customer_phone, 30),
      clean(shipping_address, 2000),
      clean(notes, 1000)
    ]);
    orderId = orderResult.rows[0].id;

    for (const item of preparedItems) {
      const stockResult = await client.query(`
        UPDATE products
        SET stock = stock - $1,
            updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
        WHERE id = $2 AND stock >= $1
      `, [item.quantity, item.product.id]);
      if (!stockResult.rowCount) {
        throw new Error(`STOCK_CONFLICT:${item.product.title}`);
      }

      await client.query(`
        INSERT INTO order_items (
          order_id, product_id, quantity, unit_price,
          selected_options, product_title
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        orderId,
        item.product.id,
        item.quantity,
        item.unitPrice,
        JSON.stringify(item.selected_options),
        item.product.title
      ]);
    }

    if (idempotencyKey) {
      await client.query(`
        INSERT INTO idempotency_keys (key, user_id, order_id)
        VALUES ($1, $2, $3)
      `, [idempotencyKey, req.user.id, orderId]);
    }
    await client.query('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK');
    }
    if (String(error.message).startsWith('STOCK_CONFLICT:')) {
      return res.status(409).json({
        error: `Insufficient stock for ${error.message.split(':').slice(1).join(':')}`
      });
    }
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This Idempotency-Key has already been used'
      });
    }
    throw error;
  } finally {
    client.release();
  }

  const savedResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  return res.status(201).json({
    message: 'Order placed successfully',
    ...await orderWithItems(savedResult.rows[0])
  });
}));

router.get('/admin/all', requireAdmin, asyncHandler(async (_req, res) => {
  const result = await db.query('SELECT * FROM orders ORDER BY id DESC');
  res.json(await Promise.all(result.rows.map(orderWithItems)));
}));

router.patch('/:id/status', requireAdmin, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  const status = String(req.body?.status || '').toLowerCase();
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  if (!['confirmed', 'delivered'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = await db.query(
    'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
    [status, orderId]
  );
  if (!result.rowCount) {
    return res.status(404).json({ error: 'Order not found' });
  }
  return res.json(await orderWithItems(result.rows[0]));
}));

router.get('/my-orders', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC',
    [req.user.id]
  );
  res.json(await Promise.all(result.rows.map(orderWithItems)));
}));

router.get('/:id', authenticateToken, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }

  const result = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = result.rows[0];
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (
    Number(order.user_id) !== Number(req.user.id) &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({ error: 'You cannot access this order' });
  }
  res.json(await orderWithItems(order));
}));

export default router;
