/**
 * Custom auth module — replaces Supabase auth with email/password + Google Sign-In.
 * Tokens are stored in localStorage. The server issues JWTs.
 */

const GOOGLE_CLIENT_ID = '1010797437683-acc3bke8o6qsj69370700vbfk6chbmep.apps.googleusercontent.com';

const TOKEN_KEY = 'crazy_stuff_token';
const USER_KEY = 'crazy_stuff_user';

/** Matches the shape consumed by LobbyScene / IsoScene (`authState.session.user.id`). */
export interface AuthSession {
  user: { id: string; email?: string };
  access_token: string;
}

export interface AuthState {
  session: AuthSession | null;
  username: string;
}

// ─── API helpers ────────────────────────────────────────────────────────────

function apiBase(): string {
  const loc = window.location;
  if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
    return `${loc.protocol}//${loc.hostname}:3000`;
  }
  return `${loc.protocol}//${loc.host}`;
}

async function apiPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const resp = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) return { ok: false, error: data.error ?? 'Request failed' };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

// ─── Token persistence ──────────────────────────────────────────────────────

function saveAuth(token: string, user: { id: string; username: string; email?: string }): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function loadAuth(): { token: string; user: { id: string; username: string; email?: string } } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(USER_KEY);
  if (!token || !raw) return null;
  try {
    return { token, user: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── Google Sign-In (GSI) ───────────────────────────────────────────────────

let gsiLoaded = false;

function loadGsi(): Promise<void> {
  if (gsiLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => { gsiLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

/** Trigger Google one-tap / popup and return the credential (ID token). */
function googleSignIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const google = (window as any).google;
    if (!google?.accounts?.id) {
      reject(new Error('Google Sign-In not loaded'));
      return;
    }
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: { credential: string }) => {
        if (response.credential) resolve(response.credential);
        else reject(new Error('No credential'));
      },
    });
    google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
      // If one-tap is blocked, fall back to the button / popup
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        // Render a hidden button and click it to open the popup
        let container = document.getElementById('g_id_signin_container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'g_id_signin_container';
          container.style.position = 'fixed';
          container.style.top = '-9999px';
          document.body.appendChild(container);
        }
        google.accounts.id.renderButton(container, { type: 'standard' });
        const btn = container.querySelector('div[role=button]') as HTMLElement | null;
        if (btn) btn.click();
      }
    });
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Check for existing session or show login/register UI. */
export async function authenticate(): Promise<AuthState> {
  // Check saved token
  const saved = loadAuth();
  if (saved) {
    try {
      const resp = await fetch(`${apiBase()}/auth/me`, {
        headers: { Authorization: `Bearer ${saved.token}` },
      });
      if (resp.ok) {
        const user = await resp.json();
        return {
          session: { user: { id: user.id, email: user.email }, access_token: saved.token },
          username: user.username,
        };
      }
    } catch { /* token invalid/expired — fall through to modal */ }
    clearAuth();
  }

  // Load GSI script in background
  loadGsi().catch(() => {});

  // Show auth modal
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); display: flex; align-items: center;
      justify-content: center; z-index: 10000; font-family: monospace;
    `;

    overlay.innerHTML = `
      <div style="background: #1a1a2e; border: 2px solid #444; border-radius: 8px; padding: 32px; width: 340px; color: #eee;">
        <h2 style="text-align: center; margin: 0 0 24px; color: #fff; font-size: 20px;">CRAZY STUFF</h2>
        <div id="auth-error" style="color: #ff4444; font-size: 12px; margin-bottom: 12px; display: none;"></div>
        <input id="auth-username" type="text" placeholder="Username" maxlength="20"
          style="width: 100%; padding: 10px; margin-bottom: 10px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; font-family: monospace;" />
        <input id="auth-email" type="email" placeholder="Email"
          style="width: 100%; padding: 10px; margin-bottom: 10px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; font-family: monospace;" />
        <input id="auth-password" type="password" placeholder="Password"
          style="width: 100%; padding: 10px; margin-bottom: 16px; background: #222; border: 1px solid #555; color: #fff; border-radius: 4px; box-sizing: border-box; font-family: monospace;" />
        <button id="auth-login" style="width: 48%; padding: 10px; background: #4488ff; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-family: monospace; font-weight: bold;">LOGIN</button>
        <button id="auth-register" style="width: 48%; padding: 10px; background: #44bb44; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-family: monospace; font-weight: bold; float: right;">REGISTER</button>
        <div style="text-align: center; margin: 16px 0 0; border-top: 1px solid #333; padding-top: 12px;">
          <button id="auth-google" style="width: 100%; padding: 10px; background: #fff; border: none; color: #333; border-radius: 4px; cursor: pointer; font-family: monospace; font-weight: bold;">
            Sign in with Google
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Stop keyboard events from reaching Phaser while auth modal is open
    overlay.addEventListener('keydown', (e) => e.stopPropagation());
    overlay.addEventListener('keyup', (e) => e.stopPropagation());
    overlay.addEventListener('keypress', (e) => e.stopPropagation());

    const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
    const emailInput = document.getElementById('auth-email') as HTMLInputElement;
    const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
    const errorDiv = document.getElementById('auth-error') as HTMLDivElement;

    const showError = (msg: string) => {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    };

    const cleanName = (raw: string) => raw.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20).trim() || 'Player';

    const finish = (token: string, user: { id: string; username: string; email?: string }) => {
      saveAuth(token, user);
      overlay.remove();
      resolve({
        session: { user: { id: user.id, email: user.email }, access_token: token },
        username: user.username,
      });
    };

    // ── LOGIN ──
    document.getElementById('auth-login')!.onclick = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) { showError('Email and password required'); return; }

      const result = await apiPost('/auth/login', { email, password });
      if (!result.ok) { showError(result.error!); return; }
      finish(result.data.token, result.data.user);
    };

    // ── REGISTER ──
    document.getElementById('auth-register')!.onclick = async () => {
      const username = cleanName(usernameInput.value);
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!username || !email || !password) { showError('All fields required'); return; }
      if (password.length < 6) { showError('Password must be at least 6 characters'); return; }

      const result = await apiPost('/auth/register', { email, password, username });
      if (!result.ok) { showError(result.error!); return; }
      finish(result.data.token, result.data.user);
    };

    // ── GOOGLE ──
    document.getElementById('auth-google')!.onclick = async () => {
      try {
        await loadGsi();
        const idToken = await googleSignIn();
        const result = await apiPost('/auth/google', { idToken });
        if (!result.ok) { showError(result.error!); return; }

        let username = result.data.user.username;
        // If server returns default, prompt for a username
        if (!username || username === 'Player') {
          username = window.prompt('Choose a username (max 20 characters):', '')?.trim() || 'Player';
          username = cleanName(username);
        }
        finish(result.data.token, { ...result.data.user, username });
      } catch (e: unknown) {
        showError(e instanceof Error ? e.message : 'Google sign-in failed');
      }
    };
  });
}

/** Sign out — clear local tokens. */
export async function signOut(): Promise<void> {
  clearAuth();
}
