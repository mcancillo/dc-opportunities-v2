// Application-level authentication for the customer and admin portals.
//
// Self-contained (no external deps beyond Node core): scrypt password hashing,
// HMAC-signed stateless session tokens, and a file-backed user store that is
// seeded/merged from config/auth-seed.json.
//
// Persistence: AUTH_STORE_PATH (set to a durable path such as /home/data/auth.json
// on Azure App Service so password changes survive redeploys). Falls back to a
// local data/auth.json for development.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STORE_PATH =
  process.env.AUTH_STORE_PATH || path.join(__dirname, '..', '..', 'data', 'auth.json');
const SEED_PATH = path.join(__dirname, '..', '..', 'config', 'auth-seed.json');

// Portal this instance serves: 'customer' | 'admin'. Users may only sign in to
// the portal they belong to.
const PORTAL = (process.env.APP_ROLE || 'customer').toLowerCase();

// Token lifetime and signing secret. In production AUTH_SECRET is set per app.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const SECRET =
  process.env.AUTH_SECRET ||
  // Dev fallback — stable within a process run only.
  crypto.createHash('sha256').update(`dcopps-dev-secret-${PORTAL}`).digest('hex');

// ─── Password hashing (scrypt) ─────────────────────────────────
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = crypto.scryptSync(String(password), salt, expected.length);
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

// ─── Password policy ───────────────────────────────────────────
// At least 10 characters, and must contain an uppercase letter, a digit, and a
// special (non-alphanumeric) character.
const PASSWORD_POLICY_TEXT =
  'Password must be at least 10 characters and include an uppercase letter, a number, and a special character.';

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 10) return { ok: false, error: PASSWORD_POLICY_TEXT };
  if (!/[A-Z]/.test(p)) return { ok: false, error: PASSWORD_POLICY_TEXT };
  if (!/[0-9]/.test(p)) return { ok: false, error: PASSWORD_POLICY_TEXT };
  if (!/[^A-Za-z0-9]/.test(p)) return { ok: false, error: PASSWORD_POLICY_TEXT };
  return { ok: true };
}

// ─── Store (file-backed, seed-merged) ──────────────────────────
let store = null;

function readSeed() {
  try {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
    return Array.isArray(seed.users) ? seed.users : [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[auth] could not read seed:', e.message);
    return [];
  }
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[auth] failed to write store:', e.message);
  }
}

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    store.users = store.users || [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[auth] could not read store:', e.message);
    store = { users: [] };
  }
  // Merge in any seed users that don't already exist (preserves changed
  // passwords for users that are already present).
  let changed = false;
  const existing = new Set(store.users.map((u) => u.username.toLowerCase()));
  for (const s of readSeed()) {
    const key = String(s.username || '').toLowerCase();
    if (!key || existing.has(key)) continue;
    store.users.push({
      username: s.username,
      portal: (s.portal || 'customer').toLowerCase(),
      hash: s.hash,
      mustChangePassword: s.mustChangePassword !== false,
      created_at: new Date().toISOString(),
    });
    existing.add(key);
    changed = true;
  }
  if (changed) persist();
  return store;
}

function findUser(username, portal) {
  const key = String(username || '').toLowerCase();
  return load().users.find(
    (u) => u.username.toLowerCase() === key && (!portal || u.portal === portal)
  );
}

// ─── Session tokens (HMAC-signed, stateless) ───────────────────
const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

function sign(payloadB64) {
  return b64url(crypto.createHmac('sha256', SECRET).update(payloadB64).digest());
}

function issueToken(user) {
  const payload = {
    u: user.username,
    p: user.portal,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64urlJson(payload);
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'));
  } catch {
    return null;
  }
  if (!payload || payload.exp < Date.now()) return null;
  if (payload.p !== PORTAL) return null; // token issued for the other portal
  return payload;
}

// ─── Public API ────────────────────────────────────────────────
function authenticate(username, password) {
  const user = findUser(username, PORTAL);
  if (!user || !verifyPassword(password, user.hash)) {
    return { ok: false, error: 'Invalid username or password.' };
  }
  return {
    ok: true,
    token: issueToken(user),
    mustChangePassword: !!user.mustChangePassword,
    user: { username: user.username, portal: user.portal },
  };
}

function changePassword(username, currentPassword, newPassword) {
  const user = findUser(username, PORTAL);
  if (!user || !verifyPassword(currentPassword, user.hash)) {
    return { ok: false, error: 'Current password is incorrect.' };
  }
  const policy = validatePassword(newPassword);
  if (!policy.ok) return { ok: false, error: policy.error };
  if (verifyPassword(newPassword, user.hash)) {
    return { ok: false, error: 'New password must be different from the current password.' };
  }
  user.hash = hashPassword(newPassword);
  user.mustChangePassword = false;
  user.password_changed_at = new Date().toISOString();
  persist();
  return { ok: true };
}

function getUser(username) {
  const user = findUser(username, PORTAL);
  if (!user) return null;
  return {
    username: user.username,
    portal: user.portal,
    mustChangePassword: !!user.mustChangePassword,
  };
}

module.exports = {
  PORTAL,
  PASSWORD_POLICY_TEXT,
  hashPassword,
  validatePassword,
  authenticate,
  changePassword,
  verifyToken,
  getUser,
};
