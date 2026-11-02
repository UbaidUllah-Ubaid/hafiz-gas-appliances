import express from 'express';
import db from '../db.js';
import {
  authenticateToken,
  requireAdmin
} from '../middleware/auth.js';

const router = express.Router();

const validStatuses = [
  'pending',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled'
];

const cents = value => Math.round(Number(value) * 100);

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

function clean(value, max) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  return value.trim().slice(0, max) || null;
}

function orderWithItems(order) {
  const items = db.prepare(`
    SELECT
      oi.*,
      COALESCE(oi.product_title, p.title) AS title,
      p.sku
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
  `).all(order.id);

  return {
    ...order,
    items: items.map(item => ({
      ...item,
      selected_options: safeJson(item.selected_options, {})
    }))
  };
}

/* =========================================
   1. CUSTOMER: PLACE A NEW ORDER
========================================= */

router.post('/', authenticateToken, (req, res, next) => {
  const {
    items,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    notes
  } = req.body || {};

  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 100
  ) {
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
    return res.status(400).json({
      error: 'Invalid shipping address'
    });
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
    return res.status(400).json({
      error: 'Invalid Idempotency-Key header'
    });
  }

  try {
    if (idempotencyKey) {
      const previousOrder = db.prepare(`
        SELECT o.*
        FROM idempotency_keys k
        JOIN orders o ON o.id = k.order_id
        WHERE k.key = ? AND k.user_id = ?
      `).get(idempotencyKey, req.user.id);

      if (previousOrder) {
        return res.status(200).json({
          message: 'Order already created for this idempotency key',
          ...orderWithItems(previousOrder)
        });
      }
    }

    // Merge repeated product lines with identical selected options.
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
      const product = db.prepare(`
        SELECT *
        FROM products
        WHERE id = ? AND is_published = 1
      `).get(item.product_id);

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

      const availableOptions = db.prepare(`
        SELECT option_group, option_value, extra_price
        FROM product_options
        WHERE product_id = ?
      `).all(product.id);

      let extraCents = 0;

      for (const [group, value] of Object.entries(item.selected_options)) {
        const match = availableOptions.find(option =>
          option.option_group.trim().toLowerCase() ===
            group.trim().toLowerCase() &&
          option.option_value.trim().toLowerCase() ===
            String(value).trim().toLowerCase()
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

    db.exec('BEGIN IMMEDIATE');

    let orderId;

    try {
      const result = db.prepare(`
        INSERT INTO orders (
          user_id,
          total_price,
          customer_name,
          customer_email,
          customer_phone,
          shipping_address,
          notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        req.user.id,
        totalCents / 100,
        clean(customer_name, 100),
        clean(customer_email, 254),
        clean(customer_phone, 30),
        clean(shipping_address, 2000),
        clean(notes, 1000)
      );

      orderId = Number(result.lastInsertRowid);

      const insertItem = db.prepare(`
        INSERT INTO order_items (
          order_id,
          product_id,
          quantity,
          unit_price,
          selected_options,
          product_title
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const decrementStock = db.prepare(`
        UPDATE products
        SET stock = stock - ?,
            updated_at = datetime('now')
        WHERE id = ? AND stock >= ?
      `);

      for (const item of preparedItems) {
        const stockResult = decrementStock.run(
          item.quantity,
          item.product.id,
          item.quantity
        );

        if (!stockResult.changes) {
          throw new Error(`STOCK_CONFLICT:${item.product.title}`);
        }

        insertItem.run(
          orderId,
          item.product.id,
          item.quantity,
          item.unitPrice,
          JSON.stringify(item.selected_options),
          item.product.title
        );
      }

      if (idempotencyKey) {
        db.prepare(`
          INSERT INTO idempotency_keys (key, user_id, order_id)
          VALUES (?, ?, ?)
        `).run(idempotencyKey, req.user.id, orderId);
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');

      if (String(error.message).startsWith('STOCK_CONFLICT:')) {
        return res.status(409).json({
          error: `Insufficient stock for ${error.message.split(':').slice(1).join(':')}`
        });
      }

      if (String(error.message).includes('UNIQUE')) {
        return res.status(409).json({
          error: 'This Idempotency-Key has already been used'
        });
      }

      throw error;
    }

    const savedOrder = db.prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
    `).get(orderId);

    return res.status(201).json({
      message: 'Order placed successfully',
      ...orderWithItems(savedOrder)
    });
  } catch (error) {
    next(error);
  }
});


/* =========================================
   2. ADMIN: GET ALL CUSTOMERS' ORDERS
========================================= */

router.get('/admin/all', requireAdmin, (req, res, next) => {
  try {
    const orders = db.prepare(`
      SELECT *
      FROM orders
      ORDER BY id DESC
    `).all();

    return res.json(orders.map(orderWithItems));
  } catch (error) {
    next(error);
  }
});


/* =========================================
   3. ADMIN: UPDATE AN ORDER'S STATUS
========================================= */

router.patch('/:id/status', requireAdmin, (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        error: 'Invalid order ID'
      });
    }

    // These are the two status changes supported by the admin UI.
    if (!['confirmed', 'delivered'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status'
      });
    }

    const result = db.prepare(`
      UPDATE orders
      SET status = ?
      WHERE id = ?
    `).run(status, orderId);

    if (!result.changes) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    const updatedOrder = db.prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
    `).get(orderId);

    return res.json(orderWithItems(updatedOrder));
  } catch (error) {
    next(error);
  }
});


/* =========================================
   4. CUSTOMER: GET THEIR OWN ORDERS
========================================= */

router.get('/my-orders', authenticateToken, (req, res, next) => {
  try {
    const orders = db.prepare(`
      SELECT *
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC
    `).all(req.user.id);

    return res.json(orders.map(orderWithItems));
  } catch (error) {
    next(error);
  }
});


/* =========================================
   5. CUSTOMER/ADMIN: GET ONE ORDER
========================================= */

router.get('/:id', authenticateToken, (req, res, next) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({
        error: 'Invalid order ID'
      });
    }

    const order = db.prepare(`
      SELECT *
      FROM orders
      WHERE id = ?
    `).get(orderId);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found'
      });
    }

    if (
      Number(order.user_id) !== Number(req.user.id) &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        error: 'You cannot access this order'
      });
    }

    return res.json(orderWithItems(order));
  } catch (error) {
    next(error);
  }
});

export default router;