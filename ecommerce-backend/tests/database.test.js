import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hga-backend-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
const { default: db } = await import('../db.js');

test('database initializes required e-commerce tables', () => {
 const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name);
 for (const name of ['users','products','product_options','reviews','orders','order_items','contact_messages','idempotency_keys']) assert.ok(names.includes(name), `missing table ${name}`);
});

test('product constraints reject negative price and stock', () => {
 assert.throws(() => db.prepare('INSERT INTO products(title,sku,description,price,stock) VALUES(?,?,?,?,?)').run('Test','TEST-NEG-PRICE','Description',-1,1));
 assert.throws(() => db.prepare('INSERT INTO products(title,sku,description,price,stock) VALUES(?,?,?,?,?)').run('Test','TEST-NEG-STOCK','Description',1,-1));
});

test('review ratings are constrained to 1 through 5', () => {
 const user = db.prepare("INSERT INTO users(name,email,phone,password,role) VALUES('Test','test@example.com','','hash','user')").run();
 const product = db.prepare("INSERT INTO products(title,sku,description,price,stock) VALUES('Test','TEST-REVIEW','Description',1,1)").run();
 assert.throws(() => db.prepare('INSERT INTO reviews(product_id,user_id,rating,comment) VALUES(?,?,?,?)').run(product.lastInsertRowid,user.lastInsertRowid,6,'invalid'));
});

test('contact messages persist and default to new', () => {
 const result = db.prepare('INSERT INTO contact_messages(name,email,subject,message) VALUES(?,?,?,?)').run('Test','test@example.com','Question','Hello');
 const row = db.prepare('SELECT status FROM contact_messages WHERE id=?').get(result.lastInsertRowid);
 assert.equal(row.status,'new');
});

test('SQLite foreign keys are enabled', () => {
 assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
});

test.after(() => { db.close(); fs.rmSync(tempDir,{recursive:true,force:true}); });
