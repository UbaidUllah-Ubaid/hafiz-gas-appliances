import express from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
const router=express.Router();
const limiter=rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many contact submissions. Please try again later.'}});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
router.post('/',limiter,(req,res)=>{
 const b=req.body||{}; const name=typeof b.name==='string'?b.name.trim():''; const email=typeof b.email==='string'?b.email.trim().toLowerCase():''; const phone=typeof b.phone==='string'?b.phone.trim():''; const subject=typeof b.subject==='string'?b.subject.trim():''; const message=typeof b.message==='string'?b.message.trim():'';
 if(!name||name.length>100||!emailPattern.test(email)||email.length>254||!subject||subject.length>200||!message||message.length>5000||phone.length>30) return res.status(400).json({error:'Provide a valid name, email, subject, and message. Please check field lengths.'});
 const result=db.prepare('INSERT INTO contact_messages(name,email,phone,subject,message) VALUES(?,?,?,?,?)').run(name,email,phone||null,subject,message);
 res.status(201).json({message:'Your message has been received',id:Number(result.lastInsertRowid)});
});
export default router;
