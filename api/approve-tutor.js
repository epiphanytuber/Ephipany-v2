// api/approve-tutor.js
import { query, esc, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const { id, action } = req.query;
  if (!id || !action) { res.status(400).send('Missing id or action'); return; }

  try {
    const rows = await query(`SELECT id, full_name, email, status FROM epiphany.main.tutors WHERE id = '${esc(id)}'`);
    if (!rows.length) { res.status(404).send('Tutor not found'); return; }
    const tutor = rows[0];

    const siteUrl = process.env.SITE_URL || '';

    if (action === 'approve') {
      await query(`UPDATE epiphany.main.tutors SET status = 'Comfirmed' WHERE id = '${esc(id)}'`);
      try {
        const { sendEmail, tutorApprovedEmail } = await import('./_email.js');
        await sendEmail({ to: tutor.email||tutor[2], subject: "You've been approved — Welcome to Epiphany!", html: tutorApprovedEmail({ name: tutor.full_name||tutor[1], loginUrl: `${siteUrl}` }) });
      } catch(e) { console.error('email:', e.message); }
      res.status(200).send(`<html><body style="font-family:sans-serif;background:#080808;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#C9A84C">✓ Tutor Approved</h1><p>${tutor.full_name||tutor[1]} has been approved and will receive a welcome email.</p></div></body></html>`);
    } else if (action === 'reject') {
      await query(`UPDATE epiphany.main.tutors SET status = 'Rejected' WHERE id = '${esc(id)}'`);
      try {
        const { sendEmail, tutorRejectedEmail } = await import('./_email.js');
        await sendEmail({ to: tutor.email||tutor[2], subject: 'Your Epiphany Application', html: tutorRejectedEmail({ name: tutor.full_name||tutor[1] }) });
      } catch(e) { console.error('email:', e.message); }
      res.status(200).send(`<html><body style="font-family:sans-serif;background:#080808;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#e05c5c">✗ Tutor Rejected</h1><p>${tutor.full_name||tutor[1]} has been notified.</p></div></body></html>`);
    } else {
      res.status(400).send('Invalid action');
    }
  } catch(e) {
    console.error('[approve-tutor]', e.message);
    res.status(500).send('Error: ' + e.message);
  }
}
