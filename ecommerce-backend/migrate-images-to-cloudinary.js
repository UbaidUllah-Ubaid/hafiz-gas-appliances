import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { v2 as cloudinary } from 'cloudinary';
import db, { closeDb } from './db.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function parseImages(value) {
  try {
    const result = JSON.parse(value || '[]');
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function localFilename(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  const image = value.trim();

  if (image === 'string') return null;

  let pathname = image;

  if (image.startsWith('http://') || image.startsWith('https://')) {
    try {
      const url = new URL(image);
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
        return null;
      }
      pathname = url.pathname;
    } catch {
      return null;
    }
  }

  if (!pathname.startsWith('/uploads/')) return null;

  return path.basename(decodeURIComponent(pathname));
}

async function main() {
  for (const key of [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ]) {
    if (!process.env[key]) throw new Error(`${key} is missing`);
  }

  const result = await db.query(
    'SELECT id, image_url, images FROM products ORDER BY id'
  );

  const products = result.rows;
  const filenames = new Set();

  for (const product of products) {
    const images = parseImages(product.images);

    for (const image of images) {
      const filename = localFilename(image);
      if (filename) filenames.add(filename);
    }

    const mainFilename = localFilename(product.image_url);
    if (mainFilename) filenames.add(mainFilename);
  }

  console.log(`Found ${filenames.size} unique local images.`);

  const uploaded = new Map();

  for (const filename of filenames) {
    const filePath = path.resolve(process.cwd(), 'uploads', filename);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local image not found: ${filename}`);
    }

    console.log(`Uploading: ${filename}`);

    const response = await cloudinary.uploader.upload(filePath, {
      folder: 'hafiz-gas-appliances/products',
      public_id: path.parse(filename).name,
      overwrite: true,
      resource_type: 'image',
    });

    uploaded.set(filename, response.secure_url);
  }

  function convertImage(value) {
    if (typeof value !== 'string') return null;

    const filename = localFilename(value);

    if (filename) return uploaded.get(filename) || null;

    if (value.trim() === 'string') return null;

    return value.trim() || null;
  }

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    for (const product of products) {
      const images = parseImages(product.images)
        .map(convertImage)
        .filter(Boolean);

      const mainImage =
        convertImage(product.image_url) ||
        images[0] ||
        null;

      await client.query(
        `UPDATE products
         SET image_url = $1, images = $2
         WHERE id = $3`,
        [mainImage, JSON.stringify(images), product.id]
      );
    }

    await client.query('COMMIT');

    console.log('SUCCESS: Product image URLs updated in PostgreSQL.');
    console.log(`Products updated: ${products.length}`);
    console.log(`Images uploaded: ${uploaded.size}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch(error => {
    console.error('IMAGE MIGRATION FAILED:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });