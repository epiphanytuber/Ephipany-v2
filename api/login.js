// api/login.js
import { query, col, esc, hashPassword, ok, err, cors } from './_db.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 'Email and password are required');

  const emailLower = email.toLowerCase().trim();
  const passwordHash = hashPassword(password);

  try {
    // Check learners
    const learners = await query(
      `SELECT * FROM epiphany.main.users WHERE email = '${esc(emailLower)}' AND status = 'active'`
    );
    if (learners.length > 0) {
      const user = learners[0];
      const storedHash = col(user, 'password_hash');
      if (storedHash !== passwordHash) return err(res, 'Incorrect password');

      const token = jwt.sign(
        { id: col(user,'id'), email: emailLower, type: 'learner' },
        process.env.JWT_SECRET || 'epiphany_secret',
        { expiresIn: '30d' }
      );
      return ok(res, {
        success: true, type: 'learner', token,
        user: { id: String(col(user,'id')||''), name: col(user,'full_name')||'',
                email: emailLower, phone: col(user,'phone')||'', since: col(user,'registered_on')||'' }
      });
    }

    // Check tutors
    const tutors = await query(
      `SELECT * FROM epiphany.main.tutors WHERE email = '${esc(emailLower)}'`
    );
    if (tutors.length > 0) {
      const tutor = tutors[0];
      const status = col(tutor, 'status');
      if (status !== 'Comfirmed') return err(res, `Your application is ${status}. Sign in once approved.`);

      const storedHash = col(tutor, 'password_hash');
      if (storedHash !== passwordHash) return err(res, 'Incorrect password');

      const subs = await query(
        `SELECT * FROM epiphany.main.subscriptions WHERE tutor_id = '${col(tutor,'id')}' ORDER BY created_at DESC LIMIT 1`
      );
      const sub = subs[0] || {};
      const token = jwt.sign(
        { id: col(tutor,'id'), email: emailLower, type: 'tutor' },
        process.env.JWT_SECRET || 'epiphany_secret',
        { expiresIn: '30d' }
      );
      return ok(res, {
        success: true, type: 'tutor', token,
        tutor: { id: String(col(tutor,'id')||''), name: col(tutor,'full_name')||'',
                 email: emailLower, phone: col(tutor,'phone')||'', city: col(tutor,'city')||'',
                 subject: col(tutor,'primary_subject')||'', rate: col(tutor,'hourly_rate')||0,
                 bio: col(tutor,'bio')||'', since: col(tutor,'applied_on')||'' },
        subscription: { status: col(sub,'status')||'none', trialStart: col(sub,'trial_start')||null,
                        trialEnd: col(sub,'trial_end')||null, nextBilling: col(sub,'next_billing')||null }
      });
    }

    return err(res, 'No account found with that email. Please register first.');
  } catch(e) {
    console.error('[login]', e.message);
    return err(res, 'Login failed. Please try again.', 500);
  }
}
