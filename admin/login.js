// Staff sign-in form.
(() => {
  const form = document.getElementById('login-form');
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.value, password: form.password.value }),
      });
      if (res.ok) { location.replace('/admin'); return; }
      const body = await res.json().catch(() => ({}));
      err.textContent = body.message || 'Sign in failed. Please try again.';
      err.hidden = false;
      form.password.value = ''; form.password.focus();
    } catch {
      err.textContent = "Couldn't reach the server. Check your connection.";
      err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });
  form.email.focus();
})();
