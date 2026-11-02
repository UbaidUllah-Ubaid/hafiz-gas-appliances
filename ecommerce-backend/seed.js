import 'dotenv/config';
import bcrypt from 'bcryptjs';
import db from './db.js';

// Safe demo seed: never clears tables and refuses to overwrite existing records.
async function seed(){
 const adminEmail=(process.env.SEED_ADMIN_EMAIL||'admin@store.com').trim().toLowerCase();
 const adminPassword=process.env.SEED_ADMIN_PASSWORD;
 if(!adminPassword || adminPassword.length<12){
  console.error('Set SEED_ADMIN_PASSWORD to a strong password of at least 12 characters before running npm run seed.');
  process.exitCode=1; return;
 }
 if(!db.prepare('SELECT id FROM users WHERE email=?').get(adminEmail)){
  const hash=await bcrypt.hash(adminPassword,12);
  db.prepare("INSERT INTO users(name,email,phone,password,role) VALUES(?,?,?,?, 'admin')").run(process.env.SEED_ADMIN_NAME||'Store Admin',adminEmail,process.env.SEED_ADMIN_PHONE||'',hash);
  console.log(`Created admin account: ${adminEmail}`);
 } else console.log(`Admin account already exists; left unchanged: ${adminEmail}`);
 if(db.prepare('SELECT id FROM products LIMIT 1').get()) { console.log('Products already exist; demo products were not added.'); return; }
 const add=db.prepare('INSERT INTO products(title,sku,description,price,stock,category) VALUES(?,?,?,?,?,?)');
 add.run('Demo Gas Hob','DEMO-HOB-001','Replace this demonstration item with your real product data.',18500,10,'Gas Appliances');
 add.run('Demo Gas Water Heater','DEMO-GWH-001','Replace this demonstration item with your real product data.',32000,5,'Water Heaters');
 console.log('Added two demo products. Edit or delete them from the admin panel.');
}
seed().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.close());
