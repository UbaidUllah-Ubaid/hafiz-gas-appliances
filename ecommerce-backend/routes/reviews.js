import express from 'express';
import db from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
const router=express.Router();
router.post('/products/:productId/reviews',authenticateToken,(req,res)=>{
 const productId=Number(req.params.productId); const {rating,comment}=req.body||{};
 if(!Number.isInteger(productId)||productId<1) return res.status(400).json({error:'Invalid product ID'});
 if(!Number.isInteger(rating)||rating<1||rating>5||typeof comment!=='string'||!comment.trim()||comment.trim().length>2000) return res.status(400).json({error:'Rating must be an integer from 1 to 5 and comment must be 1–2000 characters'});
 if(!db.prepare('SELECT id FROM products WHERE id=? AND is_published=1').get(productId)) return res.status(404).json({error:'Product not found'});
 const result=db.prepare('INSERT INTO reviews(product_id,user_id,rating,comment) VALUES(?,?,?,?)').run(productId,req.user.id,rating,comment.trim());
 res.status(201).json({message:'Review added successfully',id:Number(result.lastInsertRowid)});
});
export default router;
