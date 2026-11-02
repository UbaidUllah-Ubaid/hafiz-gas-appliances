import 'dotenv/config';
import jwt from 'jsonwebtoken';

export function getJwtSecret() {
 const secret = process.env.JWT_SECRET;
 if (!secret || secret.length < 32 || secret.includes('replace-this')) {
   if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.');
   return 'development-only-secret-change-this-before-deployment-123456';
 }
 return secret;
}

export const authenticateToken = (req, res, next) => {
 const [scheme, token] = (req.headers.authorization || '').split(' ');
 if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'A Bearer access token is required' });
 try {
   req.user = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
   next();
 } catch {
   return res.status(401).json({ error: 'Invalid or expired token' });
 }
};

export const requireAdmin = (req, res, next) => authenticateToken(req, res, () => {
 if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
 next();
});
