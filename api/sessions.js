// api/sessions.js
import { query, esc, ok, err, cors } from './_db.js';
import { sendEmail } from './_email.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  // GET — fetch sessions for learner or tutor
  if (req.method === 'GET') {
    const { email, type } = req.query || {};
    if (!email) return err(res, 'Email required');
    try {
      let rows;
      if (type === 'tutor') {
        rows = await query(`
          SELECT id, learner_name, learner_email, subject, day, time, mode, rate, status, booked_at
          FROM epiphany.main.sessions
          WHERE tutor_email = '${esc(email)}'
          ORDER BY booked_at DESC
        `);
      } else {
        rows = await query(`
          SELECT id, tutor_name, tutor_email, subject, day, time, mode, rate, status, booked_at
          FROM epiphany.main.sessions
          WHERE learner_email = '${esc(email)}'
          ORDER BY booked_at DESC
        `);
      }
      return ok(res, { sessions: rows });
    } catch(e) {
      console.error('[sessions GET]', e.message);
      return err(res, 'Failed to load sessions', 500);
    }
  }

  // POST — create a new session booking
  if (req.method === 'POST') {
    const { learnerName, learnerEmail, tutorName, tutorEmail, subject, day, time, rate, mode } = req.body || {};
    if (!learnerName || !learnerEmail || !tutorName || !subject || !day || !time) {
      return err(res, 'Missing required fields');
    }

    try {
      const id = 'BK-' + Date.now();
      await query(`
        INSERT INTO epiphany.main.sessions
          (id, learner_name, learner_email, tutor_name, tutor_email, subject, day, time, rate, mode, status, booked_at)
        VALUES (
          '${esc(id)}', '${esc(learnerName)}', '${esc(learnerEmail)}',
          '${esc(tutorName)}', '${esc(tutorEmail||'')}', '${esc(subject)}',
          '${esc(day)}', '${esc(time)}', ${parseFloat(rate)||0},
          '${esc(mode||'Online')}', 'confirmed', NOW()
        )
      `);

      // Send confirmation email to learner
      try {
        await sendEmail({
          to: learnerEmail,
          subject: `Session Confirmed — ${subject} with ${tutorName}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <h2 style="color:#C9A84C">Session Confirmed ✦</h2>
              <p>Hi ${learnerName},</p>
              <p>Your tutoring session has been booked successfully!</p>
              <table style="width:100%;border-collapse:collapse;margin:24px 0">
                <tr><td style="padding:8px 0;color:#888">Tutor</td><td style="padding:8px 0"><strong>${tutorName}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#888">Subject</td><td style="padding:8px 0"><strong>${subject}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#888">Day</td><td style="padding:8px 0"><strong>${day}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#888">Time</td><td style="padding:8px 0"><strong>${time}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#888">Mode</td><td style="padding:8px 0"><strong>${mode||'Online'}</strong></td></tr>
                <tr><td style="padding:8px 0;color:#888">Rate</td><td style="padding:8px 0"><strong>R${rate}/hr</strong></td></tr>
              </table>
              <p>Visit <a href="https://epiphanytutors.co.za" style="color:#C9A84C">epiphanytutors.co.za</a> to view your dashboard.</p>
              <p style="color:#888;font-size:12px">— The Epiphany Team</p>
            </div>
          `
        });
      } catch(emailErr) {
        console.error('[sessions] learner email failed:', emailErr.message);
      }

      // Send notification email to tutor if we have their email
      if (tutorEmail) {
        try {
          await sendEmail({
            to: tutorEmail,
            subject: `New Booking — ${subject} with ${learnerName}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
                <h2 style="color:#C9A84C">New Session Booked ✦</h2>
                <p>Hi ${tutorName},</p>
                <p>You have a new tutoring session booked!</p>
                <table style="width:100%;border-collapse:collapse;margin:24px 0">
                  <tr><td style="padding:8px 0;color:#888">Learner</td><td style="padding:8px 0"><strong>${learnerName}</strong></td></tr>
                  <tr><td style="padding:8px 0;color:#888">Subject</td><td style="padding:8px 0"><strong>${subject}</strong></td></tr>
                  <tr><td style="padding:8px 0;color:#888">Day</td><td style="padding:8px 0"><strong>${day}</strong></td></tr>
                  <tr><td style="padding:8px 0;color:#888">Time</td><td style="padding:8px 0"><strong>${time}</strong></td></tr>
                  <tr><td style="padding:8px 0;color:#888">Mode</td><td style="padding:8px 0"><strong>${mode||'Online'}</strong></td></tr>
                </table>
                <p>Log in to <a href="https://epiphanytutors.co.za" style="color:#C9A84C">epiphanytutors.co.za</a> to manage your sessions.</p>
                <p style="color:#888;font-size:12px">— The Epiphany Team</p>
              </div>
            `
          });
        } catch(emailErr) {
          console.error('[sessions] tutor email failed:', emailErr.message);
        }
      }

      return ok(res, { success: true, id });
    } catch(e) {
      console.error('[sessions POST]', e.message);
      return err(res, 'Failed to save session: ' + e.message, 500);
    }
  }

  return err(res, 'Method not allowed', 405);
}
