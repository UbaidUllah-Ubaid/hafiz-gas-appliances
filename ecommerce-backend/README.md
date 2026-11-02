# HAFIZ GAS APPLIANCES — E-commerce Backend

A REST API built with Node.js, Express, and **SQLite**. This project intentionally keeps SQLite as requested. It uses Node's built-in `node:sqlite` API, so use **Node.js 22.13+** (Node 22 LTS recommended).

## 1. Run locally

1. Install Node.js 22.13 or newer.
2. Extract this ZIP and open the `ecommerce-backend` folder in VS Code.
3. In a terminal run:

   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and set a long random `JWT_SECRET` (at least 32 characters). Set `CORS_ORIGINS=http://localhost:4200` for a default Angular dev server.
5. Create an admin account:

   ```bash
   npm run create-admin
   ```

   Enter an email and a strong password of at least 12 characters. Alternatively set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, and `ADMIN_PASSWORD` in your environment before running the command.
6. Start the API:

   ```bash
   npm run dev
   ```

   Production-style local start: `npm start`.

The API is at `http://localhost:3000`; Swagger docs are at `http://localhost:3000/api-docs`; health check is `http://localhost:3000/api/health`.

## 2. SQLite database and persistence

The database is created automatically at `./data/ecommerce.db` by default. Configure `DATABASE_PATH` to use another persistent path. Existing databases are migrated additively on startup; startup does not clear tables. Keep backups of the database and the `uploads` folder. On a hosting provider, use a persistent disk/volume for both paths—ephemeral filesystems may be wiped during redeployment.

`npm run seed` is optional and **does not clear existing data**. It requires `SEED_ADMIN_PASSWORD` of at least 12 characters. It creates an admin only if the email is new and adds demo products only when no products exist. Demo products are not real HAFIZ GAS APPLIANCES inventory.

## 3. Main endpoints

All request/response bodies are JSON unless an image upload uses multipart form data.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API/database health |
| POST | `/api/auth/register` | Public | Register customer |
| POST | `/api/auth/login` | Public | Login, receive JWT |
| GET | `/api/auth/me` | Bearer token | Current user |
| GET | `/api/products?page=1&limit=24` | Public | Published products, pagination |
| GET | `/api/products/:id` | Public | Product details/options/reviews |
| POST | `/api/products` | Admin | Create product |
| PUT | `/api/products/:id` | Admin | Update product |
| DELETE | `/api/products/:id` | Admin | Delete product (blocked when order history references it) |
| POST | `/api/products/:productId/reviews` | Login | Create review |
| POST | `/api/orders` | Login | Create order |
| GET | `/api/orders/my-orders` | Login | Current customer's orders |
| GET | `/api/orders/:id` | Owner or admin | Order details |
| GET | `/api/admin/dashboard-stats` | Admin | Dashboard counts/revenue |
| GET | `/api/admin/orders?page=1&limit=25` | Admin | Paginated orders; optional `status` filter |
| PUT | `/api/admin/orders/:id/status` | Admin | Update status through allowed transitions |
| GET | `/api/admin/contacts` | Admin | Paginated contact messages |
| PATCH | `/api/admin/contacts/:id/status` | Admin | Update contact message status |
| POST | `/api/admin/uploads` | Admin | Upload up to 8 images, multipart field `images` |
| POST | `/api/contact` | Public | Submit customer contact message |

Admin endpoints require `Authorization: Bearer YOUR_JWT_TOKEN`.

### Product example

```json
{
  "title": "Gas Hob",
  "sku": "HGA-HOB-001",
  "description": "Product description",
  "price": 18500,
  "stock": 10,
  "category": "Gas Appliances",
  "images": ["http://localhost:3000/uploads/example.webp"],
  "options": [
    { "option_group": "Finish", "option_value": "Black", "extra_price": 0 }
  ]
}
```

For image uploads, first call `POST /api/admin/uploads` with `multipart/form-data`, field name `images`, and the admin Bearer token. Add the returned image URL(s) to the product's `images` array or `image_url` field.

### Order example

```json
{
  "items": [
    { "product_id": 1, "quantity": 2, "selected_options": { "Finish": "Black" } }
  ],
  "customer_name": "Customer Name",
  "customer_email": "customer@example.com",
  "customer_phone": "03XXXXXXXXX",
  "shipping_address": "Full delivery address",
  "notes": "Optional delivery note"
}
```

The server recalculates totals from database prices and validates stock/options. For retry-safe checkout, send a unique `Idempotency-Key` header for a single checkout attempt and reuse the same key only when retrying that attempt. The API currently records orders; it does not claim that online payment processing is integrated.

### Contact example

```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "03XXXXXXXXX",
  "subject": "Product inquiry",
  "message": "Please share product details."
}
```

## 4. Frontend integration

Set Angular's API base URL to `http://localhost:3000/api`. Example routes include `/products`, `/auth/login`, and `/orders`. Keep the returned JWT in your chosen frontend auth strategy and send it as `Authorization: Bearer <token>` for protected calls. Public product listing returns `{ data, pagination }`, not a bare array. Adjust your Angular service accordingly.

CORS origins are configured using `CORS_ORIGINS` as a comma-separated list. Do not use `*` in production. Use HTTPS and a long random JWT secret in production.

## 5. Image storage

Uploaded images are stored on disk in `UPLOAD_DIR` (default `./uploads`) and served from `/uploads/...`. This is persistent only if the host's disk is persistent. For cloud deployment, attach a persistent volume or replace the storage adapter with a cloud object-storage provider. Never assume a host's temporary filesystem persists across redeployments. Supported image MIME types are JPEG, PNG, WebP, and GIF; default maximum is 5 MB per image (`MAX_UPLOAD_MB`).

## 6. Commands and troubleshooting

- `npm run check` — syntax checks.
- `npm test` — automated tests.
- `npm run create-admin` — create an admin account without clearing data.
- `npm run seed` — optional non-destructive demo seed; requires `SEED_ADMIN_PASSWORD`.

**Login fails:** confirm the API is running, use the exact email/password used by `npm run create-admin`, and check that `DATABASE_PATH` points to the same database for both commands and server. There is no default admin password.

**Database error:** use Node.js 22.13+; verify that `DATABASE_PATH`'s parent directory is writable. Back up the `.db` file before manually changing it.

**CORS error:** add the exact frontend origin (including port) to `CORS_ORIGINS` and restart the API.

**Upload error:** send multipart form data using field name `images`, supported image files, and an admin token. Ensure `UPLOAD_DIR` is writable and persistent.

## 7. Production checklist

- Configure a strong secret and production CORS origins.
- Use HTTPS and a persistent disk for SQLite and uploads; back both up regularly.
- Configure a reverse proxy and monitor logs/health checks.
- Verify backups and restore procedures.
- Run `npm run check` and `npm test` before deploying.
- Review business rules and legal/privacy requirements before accepting real customer data.

This is a practical small-business backend foundation, not a claim of independently audited or load-tested production readiness. Automated checks and any external services still need to be tested in the actual deployment environment.
