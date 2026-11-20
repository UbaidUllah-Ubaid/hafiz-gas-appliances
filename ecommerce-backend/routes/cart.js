import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import asyncHandler from '../middleware/async-handler.js';

const router = express.Router();

// Get the logged-in customer's saved cart.
router.get('/', authenticateToken, asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT items FROM customer_carts WHERE user_id = $1',
    [req.user.id]
  );
  const cart = result.rows[0];
  res.json({ items: cart ? JSON.parse(cart.items) : [] });
}));

// Save the logged-in customer's cart.
router.put('/', authenticateToken, asyncHandler(async (req, res) => {
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length > 100) {
      return res.status(400).json({
        error: 'Cart must be an array containing at most 100 items.'
      });
    }

    const validItems = items.every(item =>
      item &&
      (typeof item.id === 'string' || typeof item.id === 'number') &&
      (typeof item.productId === 'string' ||
        typeof item.productId === 'number') &&
      typeof item.name === 'string' &&
      typeof item.image === 'string' &&
      typeof item.price === 'number' &&
      Number.isFinite(item.price) &&
      item.price >= 0 &&
      Number.isInteger(item.quantity) &&
      item.quantity >= 1 &&
      item.quantity <= 1000
    );

    if (!validItems) {
      return res.status(400).json({
        error: 'One or more cart items are invalid.'
      });
    }

    const savedItems = JSON.stringify(items);

    await db.query(`
      INSERT INTO customer_carts (user_id, items, updated_at)
      VALUES ($1, $2, to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'))
      ON CONFLICT(user_id) DO UPDATE SET
        items = excluded.items,
        updated_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
    `, [req.user.id, savedItems]);

    res.json({ message: 'Cart saved successfully.' });
}));

export default router;