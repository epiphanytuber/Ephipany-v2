// api/payments.js
import { query, esc, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const { email, type } = req.query;
    if (!email) return err(res, 'email required');
    try {
      let rows;
      if (type === 'tutor') {
        rows = await query(`SELECT * FROM epiphany.main.payments WHERE tutor_name IN (SELECT full_name FROM epiphany.main.tutors WHERE email = '${esc(email.toLowerCase())}') ORDER BY created_at DESC`);
      } else {
        rows = await query(`SELECT * FROM epiphany.main.payments WHERE learner_email = '${esc(email.toLowerCase())}' ORDER BY created_at DESC`);
      }
      return ok(res, { success: true, payments: rows });
    } catch(e) { return err(res, 'Failed to fetch payments', 500); }
  }

  if (req.method === 'POST') {
    const { invoiceId, learnerName, learnerEmail, tutorName, subject, amount } = req.body || {};
    if (!invoiceId || !learnerEmail || !amount) return err(res, 'Missing fields');
    try {
      await query(`INSERT INTO epiphany.main.payments (invoice_id,learner_name,learner_email,tutor_name,subject,amount,status,paid_on) VALUES ('${esc(invoiceId)}','${esc(learnerName)}','${esc(learnerEmail.toLowerCase())}','${esc(tutorName)}','${esc(subject)}',${parseFloat(amount)},'paid',NOW())`);
      return ok(res, { success: true });
    } catch(e) { return err(res, 'Payment failed', 500); }
  }

  return err(res, 'Method not allowed', 405);
}
