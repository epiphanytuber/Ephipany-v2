// api/payments.js
// GET /api/payments?email=xxx&type=learner|tutor

import { query, esc, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  const { email, type } = req.query || {};
  if (!email) return err(res, 'Email required');

  try {
    let rows;
    if (type === 'tutor') {
      rows = await query(`
        SELECT id, learner_name, learner_email, subject,
               CAST(amount AS DOUBLE) as amount, status, paid_on
        FROM epiphany.main.payments
        WHERE tutor_name IN (
          SELECT full_name FROM epiphany.main.tutors WHERE email = '${esc(email)}'
        )
        ORDER BY paid_on DESC
      `);
    } else {
      // Learner — get paid sessions as invoices
      rows = await query(`
        SELECT
          s.id,
          s.tutor_name,
          s.subject,
          CAST(s.rate AS DOUBLE) as amount,
          s.status,
          s.booked_on as paid_on,
          s.day,
          s.time
        FROM epiphany.main.sessions s
        WHERE s.learner_email = '${esc(email)}'
        AND s.status IN ('confirmed', 'completed', 'cancelled')
        ORDER BY s.booked_on DESC
      `);
    }

    const payments = rows.map(function(r) {
      return {
        id:          r.id          || r[0] || '',
        invoice_id:  'INV-' + (r.id || r[0] || Date.now()).toString().slice(-8),
        tutor_name:  r.tutor_name  || r[1] || '',
        learner_name:r.learner_name|| '',
        subject:     r.subject     || r[2] || '',
        amount:      parseFloat(r.amount || r[3]) || 0,
        status:      r.status      || r[4] || 'confirmed',
        paid_on:     r.paid_on     || r[5] || '',
        day:         r.day         || '',
        time:        r.time        || '',
      };
    });

    return ok(res, { payments });
  } catch(e) {
    console.error('[payments]', e.message);
    return err(res, 'Failed to load payments: ' + e.message, 500);
  }
}
