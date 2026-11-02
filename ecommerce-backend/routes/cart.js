import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Create a table for each customer's saved cart.
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_carts (
    user_id INTEGER PRIMARY KEY,
    items TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Get the logged-in customer's saved cart.
router.get('/', authenticateToken, (req, res, next) => {
  try {
    const cart = db.prepare(
      'SELECT items FROM customer_carts WHERE user_id = ?'
    ).get(req.user.id);

    res.json({
      items: cart ? JSON.parse(cart.items) : []
    });
  } catch (error) {
    next(error);
  }
});

// Save the logged-in customer's cart.
router.put('/', authenticateToken, (req, res, next) => {
  try {
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

    db.prepare(`
      INSERT INTO customer_carts (user_id, items, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        items = excluded.items,
        updated_at = datetime('now')
    `).run(req.user.id, savedItems);

    res.json({ message: 'Cart saved successfully.' });
  } catch (error) {
    next(error);
  }
});

export default router;