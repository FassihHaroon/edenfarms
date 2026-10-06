// Create (or reset the password of) an admin account.
//   npm run create-admin -- owner@edenfarm.qa
// The password is typed in, never passed on the command line.
import 'dotenv/config';
import readline from 'node:readline';
import { createDb } from '../server/db.js';
import { hashPassword, passwordProblem } from '../server/auth.js';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: npm run create-admin -- you@example.com');
  process.exit(1);
}

async function ask(question) {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD; // for scripted setups
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = s => { if (s.includes(question)) process.stdout.write(s); else process.stdout.write('*'); };
  const answer = await new Promise(r => rl.question(question, r));
  rl.close();
  process.stdout.write('\n');
  return answer;
}

const password = await ask('New password (10+ characters): ');
const problem = passwordProblem(password);
if (problem) { console.error(problem); process.exit(1); }

const db = await createDb();
const hash = await hashPassword(password);
const { rows } = await db.query(
  `INSERT INTO admins (email, password_hash) VALUES ($1, $2)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, session_version = admins.session_version + 1
   RETURNING (xmax = 0) AS created`, [email, hash]);
console.log(rows[0].created ? `Admin ${email} created.` : `Password for ${email} reset; other devices are signed out.`);
await db.close();
