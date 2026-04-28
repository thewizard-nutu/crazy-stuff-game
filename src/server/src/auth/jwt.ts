import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string;
  username: string;
  email?: string;
}

export const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable must be set in production');
    }
    console.warn('[Auth] JWT_SECRET not set — using dev fallback. DO NOT USE IN PRODUCTION.');
    return 'dev-secret-change-me';
  }
  return secret;
})();

export function signToken(user: { _id: { toString(): string }; username: string; email?: string }): string {
  const payload: JwtPayload = { sub: user._id.toString(), username: user.username, email: user.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/** Verify a JWT and return the payload, or null if invalid/expired. */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}
