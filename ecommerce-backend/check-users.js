import db from './db.js';

const users = db.prepare(
  'SELECT id, name, email, role FROM users'
).all();

console.table(users);
db.close();