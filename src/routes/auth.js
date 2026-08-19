// Authentication routes: login, logout, change-password, me.
const express = require('express');
const auth = require('../services/auth');

const router = express.Router();

const COOKIE = 'dcauth';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.AUTH_COOKIE_INSECURE !== '1',
  sameSite: 'lax',
  path: '/',
  maxAge: 12 * 60 * 60 * 1000,
};

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, cookieOptions);
}

// Read the session user from the signed cookie (set by cookie middleware in server.js).
function currentUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  return auth.verifyToken(token);
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const result = auth.authenticate(username, password);
  if (!result.ok) return res.status(401).json({ error: result.error });
  setAuthCookie(res, result.token);
  res.json({
    ok: true,
    mustChangePassword: result.mustChangePassword,
    user: result.user,
  });
});

router.post('/change-password', (req, res) => {
  const session = currentUser(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated.' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  const result = auth.changePassword(session.u, currentPassword, newPassword);
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const session = currentUser(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated.' });
  const user = auth.getUser(session.u);
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({ ...user, policy: auth.PASSWORD_POLICY_TEXT });
});

// Policy text for the login page (unauthenticated).
router.get('/policy', (req, res) => {
  res.json({ portal: auth.PORTAL, policy: auth.PASSWORD_POLICY_TEXT });
});

module.exports = { router, currentUser, COOKIE };
