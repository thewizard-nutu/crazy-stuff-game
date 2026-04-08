import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  findUserByEmail, findUserByUsername, findUserByGoogleSub, createUser, createGoogleUser,
  getUserById, getOrCreatePlayer,
} from '../db/mongo';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const GOOGLE_CLIENT_ID = '1010797437683-acc3bke8o6qsj69370700vbfk6chbmep.apps.googleusercontent.com';

interface JwtPayload {
  sub: string;
  username: string;
  email?: string;
}

function signToken(user: { _id: any; username: string; email?: string }): string {
  const payload: JwtPayload = { sub: user._id.toString(), username: user.username, email: user.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function cleanUsername(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20).trim() || 'Player';
}

// ─── POST /auth/register ────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  try {
    const { email, password, username: rawUsername } = req.body;

    if (!email || !password || !rawUsername) {
      return res.status(400).json({ error: 'email, password, and username are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const username = cleanUsername(rawUsername);
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser(email, passwordHash, username);

    // Create player record + starter items
    await getOrCreatePlayer(user._id.toString(), username);

    const token = signToken(user as any);
    res.json({
      token,
      user: { id: user._id.toString(), username: user.username, email: user.email },
    });
  } catch (e: unknown) {
    console.error('[Auth] register error:', e);
    const msg = e instanceof Error && e.message.includes('duplicate key')
      ? 'Username or email already taken'
      : 'Registration failed';
    res.status(500).json({ error: msg });
  }
});

// ─── POST /auth/login ───────────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await findUserByUsername(username);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = signToken(user as any);
    res.json({
      token,
      user: { id: user._id.toString(), username: user.username, email: user.email },
    });
  } catch (e) {
    console.error('[Auth] login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /auth/google ──────────────────────────────────────────────────────

async function verifyGoogleToken(idToken: string): Promise<{
  sub: string; email: string; name?: string;
} | null> {
  try {
    const resp = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { aud?: string; sub?: string; email?: string; name?: string };
    if (data.aud !== GOOGLE_CLIENT_ID) return null;
    if (!data.sub || !data.email) return null;
    return { sub: data.sub, email: data.email, name: data.name };
  } catch {
    return null;
  }
}

router.post('/google', async (req, res) => {
  try {
    const { idToken, username: rawUsername } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const googleUser = await verifyGoogleToken(idToken);
    if (!googleUser) {
      return res.status(401).json({ error: 'Invalid Google token' });
    }

    const username = cleanUsername(rawUsername ?? googleUser.name ?? googleUser.email.split('@')[0]);

    // Find by Google sub or create
    let user = await findUserByGoogleSub(googleUser.sub);
    if (!user) {
      user = await createGoogleUser(googleUser.email, googleUser.sub, username);
    }

    // Ensure player record exists
    await getOrCreatePlayer(user!._id.toString(), user!.username ?? username);

    const token = signToken(user as any);
    res.json({
      token,
      user: { id: user!._id.toString(), username: user!.username ?? username, email: user!.email },
    });
  } catch (e: unknown) {
    console.error('[Auth] google error:', e);
    const msg = e instanceof Error && e.message.includes('duplicate key')
      ? 'Username already taken'
      : 'Google login failed';
    res.status(500).json({ error: msg });
  }
});

// ─── GET /auth/me ───────────────────────────────────────────────────────────

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as JwtPayload;
    res.json({ id: payload.sub, username: payload.username, email: payload.email });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export { router as authRouter };
