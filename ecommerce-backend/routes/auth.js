import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';

import db from '../db.js';
import { getJwtSecret, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

const verifyOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tokenFor = user =>
  jwt.sign(
    {
      id: Number(user.id),
      email: user.email,
      role: user.role,
      name: user.name
    },
    getJwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      algorithm: 'HS256'
    }
  );

const publicUser = user => ({
  id: Number(user.id),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role
});

// Gmail SMTP transporter
const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const hashValue = value =>
  crypto.createHash('sha256').update(value).digest('hex');

const genericForgotMessage =
  'If an account exists with this email, an OTP has been sent.';


// REGISTER
router.post('/register', async (req, res, next) => {
  try {
    let { name, email, phone, password, confirmPassword } = req.body || {};

    name = typeof name === 'string' ? name.trim() : '';
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    phone = typeof phone === 'string' ? phone.trim() : '';

    if (
      !name ||
      name.length > 100 ||
      !emailPattern.test(email) ||
      email.length > 254 ||
      !phone ||
      phone.length > 30 ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: 'Provide a valid name, email, phone, and password (8–128 characters).'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Passwords do not match'
      });
    }

    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      return res.status(409).json({
        error: 'Email already registered'
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = db.prepare(
      'INSERT INTO users (name,email,phone,password,role) VALUES (?,?,?,?,?)'
    ).run(name, email, phone, hash, 'user');

    const user = db.prepare(
      'SELECT id,name,email,phone,role FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);

    return res.status(201).json({
      message: 'User registered successfully',
      token: tokenFor(user),
      user: publicUser(user)
    });

  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({
        error: 'Email already registered'
      });
    }

    next(e);
  }
});


// LOGIN
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

    const password = typeof req.body?.password === 'string'
      ? req.body.password
      : '';

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required'
      });
    }

    const user = db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }

    return res.json({
      message: 'Login successful',
      token: tokenFor(user),
      user: publicUser(user)
    });

  } catch (e) {
    next(e);
  }
});


// FORGOT PASSWORD - SEND OTP
router.post('/forgot-password', forgotPasswordLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

    if (!email || email.length > 254 || !emailPattern.test(email)) {
      return res.status(400).json({
        error: 'Please enter a valid email address.'
      });
    }

    const user = db.prepare(
      'SELECT id, email FROM users WHERE email = ?'
    ).get(email);

    // Same response whether the account exists or not.
    if (!user) {
      return res.json({
        message: genericForgotMessage
      });
    }

    // Generate a six-digit OTP.
    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = hashValue(otp);
    const expiresAt = Date.now() + (5 * 60 * 1000);

    // Remove previous reset requests for this user.
    db.prepare(
      'DELETE FROM password_reset_otps WHERE user_id = ?'
    ).run(user.id);

    db.prepare(`
      INSERT INTO password_reset_otps
      (user_id, otp_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, otpHash, expiresAt);

    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'HAFIZ GAS APPLIANCES - Password Reset OTP',
        text: `Your password reset OTP is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`,
        html: `
          <div style="font-family:Arial,sans-serif;padding:25px;color:#222;">
            <h2 style="color:#e87532;">HAFIZ GAS APPLIANCES</h2>
            <h3>Password Reset Verification</h3>
            <p>Your password reset code is:</p>
            <h1 style="letter-spacing:8px;color:#e87532;">${otp}</h1>
            <p>This code expires in <strong>5 minutes</strong>.</p>
            <p>If you did not request a password reset, please ignore this email.</p>
          </div>
        `
      });
    } catch (mailError) {
      db.prepare(
        'DELETE FROM password_reset_otps WHERE user_id = ?'
      ).run(user.id);

      console.error('Password reset email failed:', mailError.message);

      return res.status(503).json({
        error: 'Unable to send OTP right now. Please try again later.'
      });
    }

    return res.json({
      message: genericForgotMessage
    });

  } catch (error) {
    next(error);
  }
});


// VERIFY OTP
router.post('/verify-reset-otp', verifyOtpLimiter, (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

    const otp = typeof req.body?.otp === 'string'
      ? req.body.otp.trim()
      : '';

    if (
      !emailPattern.test(email) ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        error: 'Please enter a valid email and 6-digit OTP.'
      });
    }

    const user = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired OTP.'
      });
    }

    const record = db.prepare(`
      SELECT * FROM password_reset_otps
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(user.id);

    if (
      !record ||
      record.verified_at ||
      record.expires_at < Date.now() ||
      record.attempts >= 5
    ) {
      return res.status(400).json({
        error: 'Invalid or expired OTP.'
      });
    }

    const submittedHash = hashValue(otp);

    const isValid = crypto.timingSafeEqual(
      Buffer.from(submittedHash, 'hex'),
      Buffer.from(record.otp_hash, 'hex')
    );

    if (!isValid) {
      db.prepare(`
        UPDATE password_reset_otps
        SET attempts = attempts + 1
        WHERE id = ?
      `).run(record.id);

      return res.status(400).json({
        error: 'Invalid or expired OTP.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashValue(resetToken);
    const resetTokenExpiresAt = Date.now() + (10 * 60 * 1000);

    db.prepare(`
      UPDATE password_reset_otps
      SET verified_at = ?,
          reset_token_hash = ?,
          reset_token_expires_at = ?
      WHERE id = ?
    `).run(
      Date.now(),
      resetTokenHash,
      resetTokenExpiresAt,
      record.id
    );

    return res.json({
      message: 'OTP verified successfully.',
      resetToken
    });

  } catch (error) {
    next(error);
  }
});


// RESET PASSWORD
router.post('/reset-password', resetPasswordLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

    const resetToken = typeof req.body?.resetToken === 'string'
      ? req.body.resetToken
      : '';

    const password = typeof req.body?.password === 'string'
      ? req.body.password
      : '';

    const confirmPassword = typeof req.body?.confirmPassword === 'string'
      ? req.body.confirmPassword
      : '';

    if (!emailPattern.test(email) || !resetToken) {
      return res.status(400).json({
        error: 'Invalid password reset request.'
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: 'Password must be between 8 and 128 characters.'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        error: 'Passwords do not match.'
      });
    }

    const user = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(email);

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired password reset session.'
      });
    }

    const record = db.prepare(`
      SELECT * FROM password_reset_otps
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(user.id);

    if (
      !record ||
      !record.verified_at ||
      !record.reset_token_hash ||
      !record.reset_token_expires_at ||
      record.reset_token_expires_at < Date.now()
    ) {
      return res.status(400).json({
        error: 'Invalid or expired password reset session.'
      });
    }

    const submittedTokenHash = hashValue(resetToken);

    const tokenIsValid = crypto.timingSafeEqual(
      Buffer.from(submittedTokenHash, 'hex'),
      Buffer.from(record.reset_token_hash, 'hex')
    );

    if (!tokenIsValid) {
      return res.status(400).json({
        error: 'Invalid or expired password reset session.'
      });
    }

    const newPasswordHash = await bcrypt.hash(password, 12);

    db.prepare(
      'UPDATE users SET password = ? WHERE id = ?'
    ).run(newPasswordHash, user.id);

    // A reset token can only be used once.
    db.prepare(
      'DELETE FROM password_reset_otps WHERE user_id = ?'
    ).run(user.id);

    return res.json({
      message: 'Password reset successfully. You can now log in.'
    });

  } catch (error) {
    next(error);
  }
});


// GET CUSTOMER PROFILE
router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare(
    'SELECT id,name,email,phone,role,created_at FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) {
    return res.status(401).json({
      error: 'Account no longer exists'
    });
  }

  res.json({ user });
});


// UPDATE CUSTOMER PROFILE
router.patch('/me', authenticateToken, (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string'
      ? req.body.name.trim()
      : '';

    const phone = typeof req.body?.phone === 'string'
      ? req.body.phone.trim()
      : '';

    if (!name || name.length > 100) {
      return res.status(400).json({
        error: 'Valid name is required.'
      });
    }

    if (!phone || phone.length > 30) {
      return res.status(400).json({
        error: 'Valid phone number is required.'
      });
    }

    const result = db.prepare(
      'UPDATE users SET name = ?, phone = ? WHERE id = ?'
    ).run(name, phone, req.user.id);

    if (!result.changes) {
      return res.status(404).json({
        error: 'User not found.'
      });
    }

    const user = db.prepare(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    return res.json({
      message: 'Profile updated successfully',
      user
    });

  } catch (error) {
    next(error);
  }
});

export default router;