// api/cancel-session.js
// POST /api/cancel-session { sessionId, learnerEmail, reason }

import { query, esc, ok, err, cors } from './_db.js';
import { sendEmail } from './_email.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { sessionId, learnerEmail, reason } = req.body || {};
  if (!sessionId || !learnerEmail) return err(res, 'sessionId and learnerEmail required');

  try {
    // Get session details first
    const sessions = await query(`
      SELECT id, learner_name, learner_email, tutor_name, subject, day, time, mode
      FROM epiphany.main.sessions
      WHERE id = '${esc(sessionId)}' AND learner_email = '${esc(learnerEmail)}'
      AND status = 'confirmed'
    `);

    if (!sessions.length) return err(res, 'Session not found or already cancelled');

    const s = sessions[0];
    const learnerName = s.learner_name || s[1];
    const learnerMail = s.learner_email || s[2];
    const tutorName   = s.tutor_name   || s[3];
    const subject     = s.subject      || s[4];
    const day         = s.day          || s[5];
    const time        = s.time         || s[6];
    const mode        = s.mode         || s[7];

    // Cancel the session
    await query(`
      UPDATE epiphany.main.sessions
      SET status = 'cancelled'
      WHERE id = '${esc(sessionId)}'
    `);

    const cancelReason = reason || 'No reason provided';
    const emailStyle = 'font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px';
    const logoHtml = '<div style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div>';

    // Email to learner
    try {
      await sendEmail({
        to: learnerMail,
        subject: `Session Cancelled — ${subject} with ${tutorName}`,
        html: `<div style="${emailStyle}">${logoHtml}
          <h2 style="color:#e05c5c;font-weight:300">Session Cancelled</h2>
          <p>Hi ${learnerName}, your session has been cancelled.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f9f9f9;padding:16px">
            <tr><td style="padding:8px;color:#666">Tutor</td><td><strong>${tutorName}</strong></td></tr>
            <tr><td style="padding:8px;color:#666">Subject</td><td><strong>${subject}</strong></td></tr>
            <tr><td style="padding:8px;color:#666">Day</td><td><strong>${day}</strong></td></tr>
            <tr><td style="padding:8px;color:#666">Time</td><td><strong>${time}</strong></td></tr>
            <tr><td style="padding:8px;color:#666">Reason</td><td>${cancelReason}</td></tr>
          </table>
          <p>You can book a new session at <a href="https://epiphanytutors.co.za" style="color:#C9A84C">epiphanytutors.co.za</a></p>
          <p style="color:#888;font-size:12px">— The Epiphany Team</p>
        </div>`
      });
    } catch(e) { console.error('[cancel] learner email failed:', e.message); }

    // Get tutor email and send notification
    try {
      const tutors = await query(
        `SELECT email FROM epiphany.main.tutors WHERE full_name = '${esc(tutorName)}' LIMIT 1`
      );
      const tutorEmail = tutors.length ? (tutors[0].email || tutors[0][0]) : null;
      if (tutorEmail) {
        await sendEmail({
          to: tutorEmail,
          subject: `Session Cancelled — ${subject} with ${learnerName}`,
          html: `<div style="${emailStyle}">${logoHtml}
            <h2 style="color:#e05c5c;font-weight:300">Session Cancelled</h2>
            <p>Hi ${tutorName}, a session has been cancelled by the learner.</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f9f9f9;padding:16px">
              <tr><td style="padding:8px;color:#666">Learner</td><td><strong>${learnerName}</strong></td></tr>
              <tr><td style="padding:8px;color:#666">Subject</td><td><strong>${subject}</strong></td></tr>
              <tr><td style="padding:8px;color:#666">Day</td><td><strong>${day}</strong></td></tr>
              <tr><td style="padding:8px;color:#666">Time</td><td><strong>${time}</strong></td></tr>
              <tr><td style="padding:8px;color:#666">Reason</td><td>${cancelReason}</td></tr>
            </table>
            <p>This time slot is now available for other bookings.</p>
            <p style="color:#888;font-size:12px">— The Epiphany Team</p>
          </div>`
        });
      }
    } catch(e) { console.error('[cancel] tutor email failed:', e.message); }

    return ok(res, { success: true, message: 'Session cancelled successfully' });
  } catch(e) {
    console.error('[cancel-session]', e.message);
    return err(res, 'Failed to cancel session: ' + e.message, 500);
  }
}
