// api/login.js
import { query, esc, hashPassword, ok, err, cors } from './_db.js';
import crypto from 'crypto';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { email, password } = req.body || {};
  if (!email || !password) return err(res, 'Email and password are required');

  const emailLower = email.toLowerCase().trim();
  const passwordHash = hashPassword(password);
  const token = generateToken();
  const now = new Date().toISOString();

  try {
    // Check learners
    const learners = await query(
      `SELECT id, full_name, email, phone, status, registered_on
       FROM epiphany.main.users
       WHERE email = '${esc(emailLower)}' AND password_hash = '${esc(passwordHash)}'`
    );

    if (learners.length > 0) {
      const u = learners[0];
      if (u.status === 'suspended') return err(res, 'Account suspended');

      // Update session token and last login
      await query(
        `UPDATE epiphany.main.users
         SET session_token = '${esc(token)}', last_login = '${now}'
         WHERE email = '${esc(emailLower)}'`
      );

      return ok(res, {
        type: 'learner',
        token,
        user: {
          id: u.id,
          name: u.full_name,
          email: u.email,
          phone: u.phone || '',
          since: u.registered_on ? new Date(u.registered_on).toLocaleString('en-ZA', { month: 'long', year: 'numeric' }) : ''
        }
      });
    }

    // Check tutors
    const tutors = await query(
      `SELECT t.id, t.full_name, t.email, t.phone, t.city, t.primary_subject,
              t.hourly_rate, t.bio, t.status, t.applied_on,
              s.status as sub_status, s.trial_start, s.trial_end, s.next_billing
       FROM epiphany.main.tutors t
       LEFT JOIN epiphany.main.subscriptions s ON s.tutor_id = t.id
       WHERE t.email = '${esc(emailLower)}' AND t.password_hash = '${esc(passwordHash)}'`
    );

    if (tutors.length > 0) {
      const t = tutors[0];
      if (t.status !== 'Comfirmed') {
        return err(res, 'Your tutor application is still pending approval.');
      }

      // Update session token and last login
      await query(
        `UPDATE epiphany.main.tutors
         SET session_token = '${esc(token)}', last_login = '${now}'
         WHERE email = '${esc(emailLower)}'`
      );

      const sub = {
        status: t.sub_status || 'none',
        trialStart: t.trial_start || null,
        trialEnd: t.trial_end || null,
        nextBilling: t.next_billing || null
      };

      return ok(res, {
        type: 'tutor',
        token,
        tutor: {
          id: t.id,
          name: t.full_name,
          email: t.email,
          phone: t.phone || '',
          city: t.city || '',
          subject: t.primary_subject || '',
          rate: parseFloat(t.hourly_rate) || 0,
          bio: t.bio || '',
          since: t.applied_on ? new Date(t.applied_on).toLocaleString('en-ZA', { month: 'long', year: 'numeric' }) : ''
        },
        subscription: sub
      });
    }

    return err(res, 'Incorrect email or password');
  } catch(e) {
    console.error('[login]', e.message);
    return err(res, 'Login failed. Please try again.', 500);
  }
}
