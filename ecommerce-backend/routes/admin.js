import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import db from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAdmin);
const statuses = ['pending','confirmed','processing','shipped','delivered','cancelled'];
const pageArgs = req => ({ page: Math.max(1, parseInt(req.query.page || '1',10)||1), limit: Math.max(1,Math.min(100,parseInt(req.query.limit||'25',10)||25)) });
const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(uploadDir,{recursive:true});
const storage = multer.diskStorage({ destination: (_req,_file,cb)=>cb(null,uploadDir), filename: (_req,file,cb)=>cb(null,`${Date.now()}-${randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase()}`) });
const upload = multer({ storage, limits:{fileSize:Math.max(1,Number(process.env.MAX_UPLOAD_MB)||5)*1024*1024,files:8}, fileFilter:(_req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype)) });

router.get('/dashboard-stats', (req,res) => {
 const totalProducts = db.prepare('SELECT COUNT(*) count FROM products').get().count;
 const outOfStock = db.prepare('SELECT COUNT(*) count FROM products WHERE stock=0').get().count;
 const lowStock = db.prepare('SELECT COUNT(*) count FROM products WHERE stock>0 AND stock<=5').get().count;
 const totalOrders = db.prepare('SELECT COUNT(*) count FROM orders').get().count;
 const pendingOrders = db.prepare("SELECT COUNT(*) count FROM orders WHERE status='pending'").get().count;
 const totalRevenue = db.prepare("SELECT COALESCE(SUM(total_price),0) sum FROM orders WHERE status!='cancelled'").get().sum;
 const totalUsers = db.prepare("SELECT COUNT(*) count FROM users WHERE role='user'").get().count;
 res.json({ products:{totalProducts,outOfStock,lowStock}, orders:{totalOrders,pendingOrders,totalRevenue:Number(totalRevenue)}, users:{totalUsers} });
});
router.get('/orders',(req,res)=>{
 const {page,limit}=pageArgs(req); const status=typeof req.query.status==='string'?req.query.status:'';
 if(status && !statuses.includes(status)) return res.status(400).json({error:'Invalid order status'});
 const where=status?'WHERE o.status=?':''; const params=status?[status]:[];
 const total=db.prepare(`SELECT COUNT(*) count FROM orders o ${where}`).get(...params).count;
 const orders=db.prepare(`SELECT o.*,u.name AS user_name,u.email AS user_email,u.phone AS user_phone FROM orders o JOIN users u ON u.id=o.user_id ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit);
 const items=db.prepare('SELECT oi.*,COALESCE(oi.product_title,p.title) AS title,p.sku FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=?');
 res.json({data:orders.map(o=>({...o,items:items.all(o.id).map(i=>({...i,selected_options:parseJson(i.selected_options)}))})),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}});
});
function parseJson(s){try{return JSON.parse(s||'{}')}catch{return {}}}
router.put('/orders/:id/status',(req,res)=>{
 const {status}=req.body||{}; if(!statuses.includes(status)) return res.status(400).json({error:`Status must be one of: ${statuses.join(', ')}`});
 const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id); if(!order) return res.status(404).json({error:'Order not found'});
 const transitions={pending:['confirmed','cancelled'],confirmed:['processing','cancelled'],processing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
 if(order.status!==status && !transitions[order.status]?.includes(status)) return res.status(409).json({error:`Cannot change order status from ${order.status} to ${status}`});
 if(order.status===status) return res.json({message:'Order status unchanged',status});
 db.exec('BEGIN IMMEDIATE');
 try {
  if(status==='cancelled') { const items=db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(order.id); const restore=db.prepare('UPDATE products SET stock=stock+?,updated_at=datetime(\'now\') WHERE id=?'); for(const item of items) restore.run(item.quantity,item.product_id); }
  db.prepare("UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?").run(status,order.id); db.exec('COMMIT');
 } catch(e){db.exec('ROLLBACK');throw e;}
 res.json({message:'Order status updated',status});
});
router.get('/contacts',(req,res)=>{
 const {page,limit}=pageArgs(req); const status=typeof req.query.status==='string'?req.query.status:'';
 if(status && !['new','read','replied','closed'].includes(status)) return res.status(400).json({error:'Invalid contact status'});
 const where=status?'WHERE status=?':''; const params=status?[status]:[];
 const total=db.prepare(`SELECT COUNT(*) count FROM contact_messages ${where}`).get(...params).count;
 const data=db.prepare(`SELECT * FROM contact_messages ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit);
 res.json({data,pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}});
});
router.patch('/contacts/:id/status',(req,res)=>{
 const {status}=req.body||{}; if(!['new','read','replied','closed'].includes(status)) return res.status(400).json({error:'Invalid contact status'});
 const result=db.prepare("UPDATE contact_messages SET status=?,updated_at=datetime('now') WHERE id=?").run(status,req.params.id);
 if(!result.changes) return res.status(404).json({error:'Contact message not found'}); res.json({message:'Contact status updated',status});
});
router.post('/uploads', (req,res,next)=>upload.array('images',8)(req,res,err=>{if(err) return res.status(400).json({error:err.code==='LIMIT_FILE_SIZE'?'Image exceeds the configured size limit':err.message||'Upload failed'}); next();}), (req,res)=>{
 if(!req.files?.length) return res.status(400).json({error:'Upload at least one valid image using the images field'});
 const base=`${req.protocol}://${req.get('host')}`;
 res.status(201).json({images:req.files.map(f=>({url:`${base}/uploads/${encodeURIComponent(f.filename)}`,filename:f.filename,size:f.size,mimeType:f.mimetype}))});
});
export default router;
