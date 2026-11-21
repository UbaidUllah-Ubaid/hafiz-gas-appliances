import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import asyncHandler from '../middleware/async-handler.js';

const router = express.Router();

function validateReview(body) {
  const rating = Number(body?.rating);
  const comment =
    typeof body?.comment === 'string'
      ? body.comment.trim()
      : '';

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: 'Rating must be an integer from 1 to 5' };
  }

  if (comment.length > 2000) {
    return { error: 'Comment must be 2000 characters or fewer' };
  }

  return { rating, comment };
}

// GET: Load public reviews for a product
router.get(
  '/products/:productId/reviews',
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const result = await db.query(
      `SELECT
        r.id,
        r.product_id,
        r.user_id,
        u.name AS user_name,
        r.rating,
        r.comment,
        r.created_at
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.product_id = $1
       ORDER BY r.created_at DESC, r.id DESC`,
      [productId]
    );

    const reviews = result.rows;

    const reviewCount = reviews.length;

    const averageRating = reviewCount
      ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) /
        reviewCount
      : 0;

    res.json({
      reviews,
      average_rating: Number(averageRating.toFixed(1)),
      review_count: reviewCount
    });
  })
);

// POST: Submit or update a review
router.post(
  '/products/:productId/reviews',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);

    if (!Number.isInteger(productId) || productId < 1) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const input = validateReview(req.body || {});

    if (input.error) {
      return res.status(400).json({ error: input.error });
    }

    const product = await db.query(
      'SELECT id FROM products WHERE id = $1 AND is_published = 1',
      [productId]
    );

    if (!product.rowCount) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const result = await db.query(
      `INSERT INTO reviews (product_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id, user_id)
       DO UPDATE SET
         rating = EXCLUDED.rating,
         comment = EXCLUDED.comment,
         created_at = to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
       RETURNING id, product_id, user_id, rating, comment, created_at`,
      [productId, req.user.id, input.rating, input.comment]
    );

    res.status(200).json({
      message: 'Review saved successfully',
      review: result.rows[0]
    });
  })
);

// DELETE: Delete a review
router.delete(
  '/products/:productId/reviews/:reviewId',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const reviewId = Number(req.params.reviewId);
    const productId = Number(req.params.productId);

    if (
      !Number.isInteger(reviewId) ||
      reviewId < 1 ||
      !Number.isInteger(productId) ||
      productId < 1
    ) {
      return res.status(400).json({
        error: 'Invalid review or product ID'
      });
    }

    const result = await db.query(
      `DELETE FROM reviews
       WHERE id = $1
         AND product_id = $2
         AND (user_id = $3 OR $4 = 'admin')
       RETURNING id`,
      [reviewId, productId, req.user.id, req.user.role]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: 'Review not found or not permitted'
      });
    }

    res.json({ message: 'Review deleted successfully' });
  })
);

export default router;