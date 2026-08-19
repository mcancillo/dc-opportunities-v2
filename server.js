const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const { router: authRoutes } = require('./src/routes/auth');
const auth = require('./src/services/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Minimal cookie parser (no external dependency).
app.use((req, res, next) => {
  const header = req.headers.cookie || '';
  req.cookies = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) {
      const k = part.slice(0, i).trim();
      req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
});

// ─── Public routes (no authentication required) ────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'dc-opportunities-v2' });
});

app.use('/api/auth', authRoutes);

// Login/change-password page and its self-contained assets.
app.use('/auth', express.static(path.join(__dirname, 'public', 'auth')));
app.get('/login', (req, res) => res.redirect('/auth/login.html'));

// ─── Authentication gate ───────────────────────────────────────
function wantsHtml(req) {
  if (req.method !== 'GET') return false;
  return (req.headers.accept || '').includes('text/html');
}

app.use((req, res, next) => {
  const session = auth.verifyToken(req.cookies.dcauth);
  if (!session) {
    if (wantsHtml(req)) return res.redirect('/auth/login.html');
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = session;
  const user = auth.getUser(session.u);
  if (user && user.mustChangePassword) {
    // Force the password change before granting access to the app.
    if (wantsHtml(req)) return res.redirect('/auth/login.html?change=1');
    return res.status(403).json({ error: 'Password change required', mustChangePassword: true });
  }
  next();
});

// ─── Protected app (requires a valid session) ──────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DC Opportunities v2 (${auth.PORTAL}) running at http://localhost:${PORT}`);
});
