import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vhasmsyvrxqxdjnmmvhq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Dsl77q3mTpVsesFXxzCTVA_odHlgIOp';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface AuthState {
  session: Session | null;
  username: string;
}

/** Show login/register UI and return authenticated session + username. */
export async function authenticate(): Promise<AuthState> {
  // Check for existing session (including OAuth redirect)
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    let username = session.user.user_metadata?.username
      ?? session.user.user_metadata?.full_name
      ?? session.user.email?.split('@')[0]
      ?? '';

    // If no username set (e.g. Google login), prompt for one
    if (!username || username === 'Player') {
      username = window.prompt('Choose a username (max 20 characters):', '')?.trim() || 'Player';
      username = username.replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20).trim() || 'Player';
      await supabase.auth.updateUser({ data: { username } });
    }

    return { session, username };
  }

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

    document.getElementById('auth-login')!.onclick = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) { showError('Email and password required'); return; }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { showError(error.message); return; }
      if (data.session) {
        overlay.remove();
        const username = data.session.user.user_metadata?.username ?? email.split('@')[0];
        resolve({ session: data.session, username: cleanName(username) });
      }
    };

    document.getElementById('auth-register')!.onclick = async () => {
      const username = cleanName(usernameInput.value);
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!username || !email || !password) { showError('All fields required'); return; }
      if (password.length < 6) { showError('Password must be at least 6 characters'); return; }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) { showError(error.message); return; }
      if (data.session) {
        overlay.remove();
        resolve({ session: data.session, username });
      } else {
        showError('Check your email to confirm your account');
      }
    };

    document.getElementById('auth-google')!.onclick = async () => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) showError(error.message);
      // OAuth redirects to Google, then back — session will be picked up on reload
    };
  });
}

/** Sign out. */
export async function signOut() {
  await supabase.auth.signOut();
}
