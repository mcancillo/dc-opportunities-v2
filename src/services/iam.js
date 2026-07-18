// Identity & Access Management (IAM) service
// Lightweight, file-backed implementation of the access model described in
// docs/architecture-proposals.md §4–5. It manages:
//   - customers  (external client companies)
//   - users      (owner / admin / customer, with MFA enforcement flags)
//   - invites    (pending onboarding tokens)
//   - shares     (which ledger plots are visible to which customer)
//
// This is an application-layer scaffold for the admin UI. In production the
// authoritative enforcement lives in the auth provider (MFA policy) + Postgres
// Row-Level Security, as documented. Persistence mirrors the ledger service.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const IAM_PATH = path.join(__dirname, '..', '..', 'data', 'iam.json');

const ROLES = ['owner', 'admin', 'customer'];

// ─── GitHub account resolution ─────────────────────────────────
// Validates a GitHub username against the public API and returns a
// normalized identity. A token (GITHUB_TOKEN / GH_TOKEN) is used when
// available to raise the rate limit, but is not required.
async function resolveGithub(login) {
  const clean = String(login || '').trim().replace(/^@/, '');
  if (!clean || !/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(clean)) {
    throw new Error('Invalid GitHub username');
  }
  const headers = { 'User-Agent': 'dc-opportunities-iam', 'Accept': 'application/vnd.github+json' };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`https://api.github.com/users/${encodeURIComponent(clean)}`, { headers, timeout: 10000 });
  } catch (e) {
    throw new Error(`Could not reach GitHub: ${e.message}`);
  }
  if (res.status === 404) throw new Error(`GitHub account "${clean}" not found`);
  if (res.status === 403) throw new Error('GitHub API rate limit reached — set GITHUB_TOKEN and retry');
  if (!res.ok) throw new Error(`GitHub lookup failed (HTTP ${res.status})`);

  const j = await res.json();
  return {
    login: j.login,
    id: j.id,
    name: j.name || null,
    avatar_url: j.avatar_url || null,
    html_url: j.html_url || `https://github.com/${j.login}`,
    type: j.type || 'User'
  };
}

let store = null;

function seed() {
  return {
    customers: [],
    users: [
      {
        id: 'usr-owner',
        email: 'owner@dc-opportunities.local',
        name: 'Owner',
        role: 'owner',
        customer_id: null,
        mfa_required: true,
        mfa_enrolled: true,
        created_at: new Date().toISOString()
      }
    ],
    invites: [],
    shares: []
  };
}

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(IAM_PATH, 'utf-8'));
    // Backfill any missing collections
    store.customers = store.customers || [];
    store.users = store.users || [];
    store.invites = store.invites || [];
    store.shares = store.shares || [];
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[iam] could not read store:', e.message);
    store = seed();
    flush();
  }
  return store;
}

let saveTimer = null;
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    fs.writeFileSync(IAM_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[iam] failed to write store:', e.message);
  }
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

const id = prefix => `${prefix}-${crypto.randomBytes(6).toString('hex')}`;
const now = () => new Date().toISOString();

// ─── Customers ─────────────────────────────────────────────────
function listCustomers() {
  load();
  return store.customers.map(c => ({
    ...c,
    user_count: store.users.filter(u => u.customer_id === c.id).length,
    share_count: store.shares.filter(s => s.customer_id === c.id).length
  }));
}

function createCustomer({ name }) {
  load();
  if (!name || !name.trim()) throw new Error('Customer name is required');
  const customer = { id: id('cust'), name: name.trim(), created_at: now() };
  store.customers.push(customer);
  scheduleSave();
  return customer;
}

function deleteCustomer(customerId) {
  load();
  const before = store.customers.length;
  store.customers = store.customers.filter(c => c.id !== customerId);
  // Cascade: remove that customer's users, invites and shares
  store.users = store.users.filter(u => u.customer_id !== customerId);
  store.invites = store.invites.filter(i => i.customer_id !== customerId);
  store.shares = store.shares.filter(s => s.customer_id !== customerId);
  scheduleSave();
  return store.customers.length < before;
}

// ─── Users ─────────────────────────────────────────────────────
function listUsers() {
  load();
  return store.users.map(u => ({
    ...u,
    customer_name: u.customer_id
      ? (store.customers.find(c => c.id === u.customer_id)?.name || null)
      : null
  }));
}

async function createUser({ email, name, role, customer_id, github_login }) {
  load();
  if (!ROLES.includes(role)) throw new Error(`Role must be one of ${ROLES.join(', ')}`);

  // A user is identified by a GitHub account and/or an email — at least one.
  let github = null;
  if (github_login) {
    github = await resolveGithub(github_login);
    if (store.users.some(u => u.github && u.github.id === github.id)) {
      throw new Error(`GitHub account "${github.login}" is already a user`);
    }
  }
  if (!github && (!email || !/.+@.+\..+/.test(email))) {
    throw new Error('Provide a GitHub username or a valid email');
  }
  if (email && /.+@.+\..+/.test(email) &&
      store.users.some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('A user with that email already exists');
  }
  if (role === 'customer' && !customer_id) {
    throw new Error('Customer users must be linked to a customer');
  }
  if (customer_id && !store.customers.some(c => c.id === customer_id)) {
    throw new Error('Unknown customer');
  }

  const displayName = (name || '').trim()
    || (github && github.name)
    || (github && github.login)
    || (email ? email.split('@')[0] : 'user');
  const user = {
    id: id('usr'),
    email: (email || '').trim() || null,
    name: displayName,
    role,
    customer_id: role === 'customer' ? customer_id : null,
    github,                         // {login,id,name,avatar_url,html_url,type} or null
    mfa_required: true,             // customers are always MFA-enforced (§5)
    mfa_enrolled: false,
    created_at: now()
  };
  store.users.push(user);
  scheduleSave();
  return user;
}

function updateUser(userId, patch) {
  load();
  const user = store.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error('Invalid role');
    user.role = patch.role;
    if (patch.role !== 'customer') user.customer_id = null;
  }
  if (patch.customer_id !== undefined && user.role === 'customer') {
    user.customer_id = patch.customer_id;
  }
  if (patch.mfa_enrolled !== undefined) user.mfa_enrolled = !!patch.mfa_enrolled;
  if (patch.mfa_required !== undefined) {
    // Customers can never have MFA disabled.
    user.mfa_required = user.role === 'customer' ? true : !!patch.mfa_required;
  }
  scheduleSave();
  return user;
}

function deleteUser(userId) {
  load();
  const user = store.users.find(u => u.id === userId);
  if (user && user.role === 'owner' &&
      store.users.filter(u => u.role === 'owner').length <= 1) {
    throw new Error('Cannot delete the last owner');
  }
  const before = store.users.length;
  store.users = store.users.filter(u => u.id !== userId);
  scheduleSave();
  return store.users.length < before;
}

// ─── Invites ───────────────────────────────────────────────────
function listInvites() {
  load();
  return store.invites.map(i => ({
    ...i,
    customer_name: i.customer_id
      ? (store.customers.find(c => c.id === i.customer_id)?.name || null)
      : null,
    status: i.accepted_at ? 'accepted'
      : (new Date(i.expires_at) < new Date() ? 'expired' : 'pending')
  }));
}

async function createInvite({ email, role, customer_id, github_login, ttl_days = 14 }) {
  load();
  if (!ROLES.includes(role)) throw new Error('Invalid role');
  let github = null;
  if (github_login) github = await resolveGithub(github_login);
  if (!github && (!email || !/.+@.+\..+/.test(email))) {
    throw new Error('Provide a GitHub username or a valid email');
  }
  if (role === 'customer' && !customer_id) throw new Error('Customer invites need a customer');
  const invite = {
    id: id('inv'),
    email: (email || '').trim() || null,
    github,
    role,
    customer_id: role === 'customer' ? customer_id : null,
    token: crypto.randomBytes(24).toString('hex'),
    created_at: now(),
    expires_at: new Date(Date.now() + ttl_days * 86400000).toISOString(),
    accepted_at: null
  };
  store.invites.push(invite);
  scheduleSave();
  return invite;
}

function revokeInvite(inviteId) {
  load();
  const before = store.invites.length;
  store.invites = store.invites.filter(i => i.id !== inviteId);
  scheduleSave();
  return store.invites.length < before;
}

// ─── Property shares (owner-curated visibility) ────────────────
function listShares(customerId) {
  load();
  let shares = store.shares;
  if (customerId) shares = shares.filter(s => s.customer_id === customerId);
  return shares.map(s => ({
    ...s,
    customer_name: store.customers.find(c => c.id === s.customer_id)?.name || null
  }));
}

function createShare({ ledger_key, ledger_name, customer_id, note }) {
  load();
  if (!ledger_key) throw new Error('ledger_key is required');
  if (!store.customers.some(c => c.id === customer_id)) throw new Error('Unknown customer');
  // Idempotent: one share per (plot, customer)
  const existing = store.shares.find(s => s.ledger_key === ledger_key && s.customer_id === customer_id);
  if (existing) {
    if (note !== undefined) existing.note = note;
    scheduleSave();
    return existing;
  }
  const share = {
    id: id('shr'),
    ledger_key,
    ledger_name: ledger_name || ledger_key,
    customer_id,
    note: note || '',
    shared_at: now()
  };
  store.shares.push(share);
  scheduleSave();
  return share;
}

function revokeShare(shareId) {
  load();
  const before = store.shares.length;
  store.shares = store.shares.filter(s => s.id !== shareId);
  scheduleSave();
  return store.shares.length < before;
}

// Ledger keys visible to a given customer (used by a future /api/portfolio).
function keysForCustomer(customerId) {
  load();
  return store.shares.filter(s => s.customer_id === customerId).map(s => s.ledger_key);
}

// ─── Summary ───────────────────────────────────────────────────
function summary() {
  load();
  const customers = store.users.filter(u => u.role === 'customer');
  return {
    customers: store.customers.length,
    users: store.users.length,
    admins: store.users.filter(u => u.role === 'admin' || u.role === 'owner').length,
    customer_users: customers.length,
    mfa_pending: customers.filter(u => u.mfa_required && !u.mfa_enrolled).length,
    pending_invites: store.invites.filter(i => !i.accepted_at && new Date(i.expires_at) >= new Date()).length,
    shares: store.shares.length
  };
}

module.exports = {
  ROLES,
  resolveGithub,
  listCustomers, createCustomer, deleteCustomer,
  listUsers, createUser, updateUser, deleteUser,
  listInvites, createInvite, revokeInvite,
  listShares, createShare, revokeShare, keysForCustomer,
  summary
};
