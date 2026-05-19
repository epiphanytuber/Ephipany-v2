// api/reset-password.js
// POST /api/reset-password
// Body: { email, password }
import { query, esc, hashPassword, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 'Email and password are required');
  if (password.length < 6) return err(res, 'Password must be at least 6 characters');

  const emailLower = email.toLowerCase().trim();
  const passwordHash = hashPassword(password);

  try {
    // Check learners
    const learners = await query(
      `SELECT id FROM epiphany.main.users WHERE email = '${esc(emailLower)}' AND status = 'active'`
    );
    if (learners.length > 0) {
      await query(
        `UPDATE epiphany.main.users SET password_hash = '${esc(passwordHash)}' WHERE email = '${esc(emailLower)}'`
      );
      return ok(res, { success: true, message: 'Password reset successfully' });
    }

    // Check tutors
    const tutors = await query(
      `SELECT id FROM epiphany.main.tutors WHERE email = '${esc(emailLower)}'`
    );
    if (tutors.length > 0) {
      await query(
        `UPDATE epiphany.main.tutors SET password_hash = '${esc(passwordHash)}' WHERE email = '${esc(emailLower)}'`
      );
      return ok(res, { success: true, message: 'Password reset successfully' });
    }

    return err(res, 'No account found with that email address');
  } catch(e) {
    console.error('[reset-password]', e.message);
    return err(res, 'Password reset failed. Please try again.', 500);
  }
}
