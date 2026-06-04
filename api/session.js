// api/session.js
import { query, col, ok, err, cors } from './_db.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { token } = req.body || {};
  if (!token) return err(res, 'Token required');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'epiphany_secret');

    if (decoded.type === 'learner') {
      const rows = await query(`SELECT * FROM epiphany.main.users WHERE id = '${decoded.id}' AND status = 'active'`);
      if (!rows.length) return err(res, 'Session expired', 401);
      const u = rows[0];
      return ok(res, { success: true, type: 'learner',
        user: { id: String(col(u,'id')||''), name: col(u,'full_name')||'',
                email: col(u,'email')||'', phone: col(u,'phone')||'', since: col(u,'registered_on') ? new Date(String(col(u,'registered_on'))).toLocaleString('en-ZA',{month:'long',year:'numeric'}) : '' }
      });
    }

    if (decoded.type === 'tutor') {
      const rows = await query(`SELECT * FROM epiphany.main.tutors WHERE id = '${decoded.id}' AND status = 'Comfirmed'`);
      if (!rows.length) return err(res, 'Session expired', 401);
      const t = rows[0];
      const subs = await query(`SELECT * FROM epiphany.main.subscriptions WHERE tutor_id = '${decoded.id}' ORDER BY created_at DESC LIMIT 1`);
      const sub = subs[0] || {};
      return ok(res, { success: true, type: 'tutor',
        tutor: { id: String(col(t,'id')||''), name: col(t,'full_name')||'',
                 email: col(t,'email')||'', phone: col(t,'phone')||'', city: col(t,'city')||'',
                 subject: col(t,'primary_subject')||'', rate: col(t,'hourly_rate')||0,
                 bio: col(t,'bio')||'', since: col(t,'applied_on')||'' },
        subscription: { status: col(sub,'status')||'none', trialStart: col(sub,'trial_start')||null,
                        trialEnd: col(sub,'trial_end')||null, nextBilling: col(sub,'next_billing')||null }
      });
    }

    return err(res, 'Invalid token', 401);
  } catch(e) {
    if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') return err(res, 'Session expired', 401);
    return err(res, 'Session check failed', 500);
  }
}
