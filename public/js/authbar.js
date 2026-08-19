// Authenticated top-bar: shows the current user with change-password / logout
// actions, and hides the Admin tab on the customer portal.
(function () {
  async function init() {
    let me;
    try {
      const r = await fetch('/api/auth/me');
      if (!r.ok) { location.href = '/auth/login.html'; return; }
      me = await r.json();
    } catch {
      return; // network hiccup — leave the app as-is
    }

    // Force password change if still required.
    if (me.mustChangePassword) { location.href = '/auth/login.html?change=1'; return; }

    // Hide the Admin tab unless this is the admin portal.
    if (me.portal !== 'admin') {
      const btn = document.querySelector('.tab-btn[data-tab="admin-tab"]');
      if (btn) btn.style.display = 'none';
      const panel = document.getElementById('admin-tab');
      if (panel) panel.style.display = 'none';
    }

    const bar = document.createElement('div');
    bar.id = 'auth-bar';
    bar.style.cssText =
      'position:fixed;top:10px;right:12px;z-index:10000;display:flex;align-items:center;gap:10px;' +
      'background:rgba(22,27,34,.92);border:1px solid #30363d;border-radius:999px;padding:6px 12px;' +
      "font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#e6edf3;" +
      'box-shadow:0 6px 20px rgba(0,0,0,.35);';

    const user = document.createElement('span');
    user.textContent = '👤 ' + me.username + (me.portal === 'admin' ? ' (admin)' : '');
    user.style.cssText = 'color:#8b949e;';

    const change = document.createElement('a');
    change.textContent = 'Change password';
    change.href = '/auth/login.html?change=1';
    change.style.cssText = 'color:#4da6ff;text-decoration:none;cursor:pointer;';

    const logout = document.createElement('a');
    logout.textContent = 'Logout';
    logout.href = '#';
    logout.style.cssText = 'color:#ff6b6b;text-decoration:none;cursor:pointer;';
    logout.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
      location.href = '/auth/login.html';
    });

    const sep = () => {
      const s = document.createElement('span');
      s.textContent = '·'; s.style.color = '#30363d';
      return s;
    };

    bar.append(user, sep(), change, sep(), logout);
    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
