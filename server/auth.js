// Staff sign-in for /admin. Passwords are bcrypt-hashed; the session is a signed,
// HttpOnly, SameSite=Strict cookie that scripts on the page cannot read.
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const COOKIE = 'eden_admin';
const SESSION_HOURS = 12;
const MAX_FAILS = 5;            // per IP or per email ...
const FAIL_WINDOW_MIN = 15;     // ... within this many minutes

export const hashPassword = pw => bcrypt.hash(pw, 12);

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export function createAuth({ db, secret, secureCookies }) {
  const key = new TextEncoder().encode(secret);
  let dummyHash;

  async function issue(res, admin) {
    const token = await new SignJWT({ v: admin.session_version })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(admin.id))
      .setIssuedAt()
      .setExpirationTime(`${SESSION_HOURS}h`)
      .sign(key);
    res.cookie(COOKIE, token, {
      httpOnly: true, sameSite: 'strict', secure: secureCookies, path: '/', maxAge: SESSION_HOURS * 3600 * 1000,
    });
  }

  // Returns the admin row for a valid session, or null.
  async function current(req) {
    const token = req.cookies?.[COOKIE];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
      const { rows } = await db.query('SELECT id, email, name, session_version FROM admins WHERE id = $1', [Number(payload.sub)]);
      const admin = rows[0];
      // Changing the password bumps session_version, which signs out every other device.
      return admin && admin.session_version === payload.v ? admin : null;
    } catch {
      return null;
    }
  }

  async function login(req, res, { email, password }) {
    email = String(email || '').trim().toLowerCase();
    const ip = req.ip || '';
    const { rows: [fails] } = await db.query(
      `SELECT count(*) FILTER (WHERE ip = $1)::int AS by_ip, count(*) FILTER (WHERE email = $2)::int AS by_email
       FROM login_attempts WHERE NOT ok AND at > now() - make_interval(mins => $3)`, [ip, email, FAIL_WINDOW_MIN]);
    if (fails.by_ip >= MAX_FAILS || fails.by_email >= MAX_FAILS) {
      return { ok: false, status: 429, message: `Too many attempts. Try again in ${FAIL_WINDOW_MIN} minutes.` };
    }
    const { rows } = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = rows[0];
    // Compare against a dummy hash when the email is unknown, so timing reveals nothing.
    dummyHash ??= await bcrypt.hash('not-a-real-password', 12);
    const ok = await bcrypt.compare(String(password || ''), admin?.password_hash || dummyHash);
    await db.query('INSERT INTO login_attempts (ip, email, ok) VALUES ($1, $2, $3)', [ip, email, !!(admin && ok)]);
    if (!admin || !ok) return { ok: false, status: 401, message: 'Wrong email or password.' };
    await db.query('UPDATE admins SET last_login_at = now() WHERE id = $1', [admin.id]);
    await db.query(`DELETE FROM login_attempts WHERE at < now() - interval '2 days'`);
    await issue(res, admin);
    return { ok: true };
  }

  const logout = res => res.clearCookie(COOKIE, { path: '/', sameSite: 'strict', secure: secureCookies });

  // For JSON APIs: 401 without a session.
  const requireApi = async (req, res, next) => {
    const admin = await current(req);
    if (!admin) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Please sign in again.' });
    req.admin = admin;
    next();
  };

  // For admin pages: send strangers to the sign-in page, never show the panel.
  const requirePage = async (req, res, next) => {
    const admin = await current(req);
    if (!admin) return res.redirect(302, '/admin/login');
    req.admin = admin;
    next();
  };

  // Mutating admin requests must come from our own pages (defence in depth on top of SameSite).
  const sameOrigin = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = ''; }
      if (host !== req.get('host')) return res.status(403).json({ error: 'FORBIDDEN', message: 'Cross-site request blocked.' });
    }
    next();
  };

  return { issue, current, login, logout, requireApi, requirePage, sameOrigin };
}
