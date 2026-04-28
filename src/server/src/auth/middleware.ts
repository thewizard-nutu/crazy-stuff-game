import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';

/**
 * Express middleware enforcing JWT auth + ownership match.
 *
 * Requires a valid `Authorization: Bearer <token>` header where the token's
 * `sub` claim matches `req.params.userId`. Rejects with 401 if the token is
 * missing/invalid, or 403 if the token is valid but for a different user.
 *
 * Apply via `app.use('/api/player/:userId', requireOwnership)`.
 */
export function requireOwnership(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  if (payload.sub !== req.params.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
