-- A registered customer can leave one review per product.
-- Re-submitting the review updates it through the API's ON CONFLICT clause.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_product_user
  ON reviews(product_id, user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user
  ON reviews(user_id, id DESC);
