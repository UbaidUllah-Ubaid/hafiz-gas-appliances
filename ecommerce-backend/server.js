import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import reviewRoutes from './routes/reviews.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';
import contactRoutes from './routes/contact.js';
import cartRoutes from './routes/cart.js';
import swaggerSpec from './swagger.js';
import db, { closeDb } from './db.js';


const app = express();
const PORT = Number(process.env.PORT) || 3000;

const origins = (
  process.env.CORS_ORIGINS ||
  [
    'http://localhost:3000',
    'http://127.0.0.1:4200',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:63587',
    'http://localhost:59641',
    'http://192.168.0.124:4200'
  ].join(',')
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);

// CORS configuration
app.use(
  cors({
    origin(origin, cb) {
      // Allow requests without an Origin header, such as curl.
      if (!origin || origins.includes('*') || origins.includes(origin)) {
        return cb(null, true);
      }

      console.error('Blocked CORS origin:', origin);
      return cb(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key'
    ]
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`
      );
    }
  });

  next();
});

// Persistent upload directory
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use(
  '/uploads',
  express.static(uploadDir, {
    fallthrough: false,
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  })
);

// API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/cart', cartRoutes);

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1 AS ok');
    res.json({
      status: 'ok',
      database: 'connected',
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error('DATABASE HEALTH CHECK ERROR:', error);
    res.status(503).json({
      status: 'error',
      database: 'unavailable',
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// Error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const status =
    err.status ||
    (err.message?.includes('CORS') ? 403 : 500);

  res.status(status).json({
    error:
      status === 500
        ? 'Internal server error'
        : err.message || 'Request failed'
  });
});

// Start server
let server;

async function startServer() {
  await db.query('SELECT 1 AS ok');
  server = app.listen(PORT, () => {
    console.log(
      `HAFIZ GAS APPLIANCES API running at http://localhost:${PORT}\n` +
      `Docs: http://localhost:${PORT}/api-docs`
    );
  });
}

// Graceful shutdown
function shutdown() {
  if (!server) {
    closeDb().finally(() => process.exit(0));
    return;
  }

  server.close(() => closeDb().finally(() => process.exit(0)));

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer().catch(error => {
  console.error('PostgreSQL connection failed:', error);
  closeDb().finally(() => process.exit(1));
});

export default app;