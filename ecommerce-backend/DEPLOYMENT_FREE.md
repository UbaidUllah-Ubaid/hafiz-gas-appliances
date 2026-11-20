# Free-tier deployment guide (Neon + Render)

This backend is configured for PostgreSQL. The existing SQLite database is retained at `data/ecommerce.db` as the one-time import source.

## 1. Create the Neon database

1. Create a Neon project and database on its free tier.
2. Copy the pooled or direct PostgreSQL connection string from Neon.
3. Keep it private. Do not paste it into source code or commit it to Git.

## 2. Migrate the schema and import the existing data

On your computer, open this backend folder and create `.env` from `.env.example`.

Set at least:

- `DATABASE_URL` = Neon connection string
- `JWT_SECRET` = a new random secret of at least 32 characters
- `NODE_ENV=development`

Then run:

```bash
npm ci
npm run db:migrate
npm run db:import-sqlite
```

Run the importer only against the intended empty Neon database. It refuses to import if destination application tables are non-empty, uses one transaction, preserves IDs and password hashes, and does not modify the SQLite source. Keep a separate backup of the `.db` file before migration.

After importing, create an admin only if the imported database does not already contain one:

```bash
npm run create-admin
```

## 3. Deploy the API to Render

1. Push this backend folder to a private or public GitHub repository.
2. In Render, create a new **Web Service** connected to that repository.
3. Use these settings:
   - Runtime: Node
   - Build command: `npm ci`
   - Start command: `npm start`
   - Health check path: `/api/health`
   - Instance plan: Free (if available on your account)
4. Add environment variables in Render:
   - `NODE_ENV=production`
   - `DATABASE_URL` = same Neon connection string
   - `JWT_SECRET` = same long random secret used for the app
   - `CORS_ORIGINS` = exact Vercel frontend origin, e.g. `https://your-site.vercel.app` (no trailing slash)
5. Deploy and open `https://YOUR-RENDER-SERVICE.onrender.com/api/health`. It should return `status: ok` and `database: connected`.

Do not run the SQLite importer as part of Render's build or start command. Import once from your computer.

## 4. Connect the Angular frontend

Set the frontend API base URL to `https://YOUR-RENDER-SERVICE.onrender.com/api`, then deploy the frontend to Vercel. Add the final Vercel domain to `CORS_ORIGINS` in Render and redeploy/restart the backend.

## Important free-tier limitations

- Free web services may sleep when idle and take time to wake up. Free-tier availability and limits can change.
- Render's ordinary free filesystem is ephemeral. Files uploaded after deployment are not durable and can disappear after a restart/redeploy. Existing `uploads/` files are bundled with this project, but future product image uploads should use durable object/image storage or an external image URL. Do not treat Render's local disk as permanent storage.
- Neon free tier has usage, storage, and compute limits. Check the current limits in your Neon dashboard.
- This setup aims for zero monthly hosting spend within free-tier quotas; it cannot promise permanent free service, no sleep, or unlimited traffic/storage.
