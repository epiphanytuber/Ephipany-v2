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
      if (type === 'tutor-slots') {
        // Return just booked day+time slots for a tutor (by name)
        const tutorName = req.query.tutorName || '';
        const slots = await query(`
          SELECT day, time FROM epiphany.main.sessions
          WHERE tutor_name = '${esc(tutorName)}' AND status = 'confirmed'
        `);
        return ok(res, { slots: slots.map(function(r){ return { day: r.day||r[0], time: r.time||r[1] }; }) });
      } else if (type === 'tutor') {
        rows = await query(`
          SELECT id, learner_name, learner_email, subject, day, time, mode,
                 CAST(rate AS DOUBLE) as rate, status, booked_on
          FROM epiphany.main.sessions
          WHERE tutor_name IN (
            SELECT full_name FROM epiphany.main.tutors WHERE email = '${esc(email)}'
          )
          ORDER BY booked_on DESC
        `);
      } else {
        rows = await query(`
          SELECT id, tutor_name, subject, day, time, mode,
                 CAST(rate AS DOUBLE) as rate, status, booked_on
          FROM epiphany.main.sessions
          WHERE learner_email = '${esc(email)}'
          ORDER BY booked_on DESC
        `);
      }
      return ok(res, { sessions: rows });
    } catch(e) {
      console.error('[sessions GET]', e.message);
      return err(res, 'Failed to load sessions: ' + e.message, 500);
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
          (id, learner_name, learner_email, tutor_name, subject, day, time,
           rate, mode, status, booked_on)
        VALUES (
          '${esc(id)}',
          '${esc(learnerName)}',
          '${esc(learnerEmail)}',
          '${esc(tutorName)}',
          '${esc(subject)}',
          '${esc(day)}',
          '${esc(time)}',
          ${parseFloat(rate) || 0},
          '${esc(mode || 'Online')}',
          'confirmed',
          NOW()
        )
      `);

      console.log('[sessions] Saved booking:', id, learnerName, tutorName);

      // Send confirmation email to learner
      try {
        await sendEmail({
          to: learnerEmail,
          subject: `Session Confirmed — ${subject} with ${tutorName}`,
          html: `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
              <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div>
              <h2 style="color:#C9A84C;font-weight:300">Session Confirmed ✦</h2>
              <p>Hi ${learnerName},</p>
              <p>Your tutoring session has been booked successfully!</p>
              <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f9f9f9;padding:16px">
                <tr><td style="padding:8px 12px;color:#666">Tutor</td><td style="padding:8px 12px"><strong>${tutorName}</strong></td></tr>
                <tr><td style="padding:8px 12px;color:#666">Subject</td><td style="padding:8px 12px"><strong>${subject}</strong></td></tr>
                <tr><td style="padding:8px 12px;color:#666">Day</td><td style="padding:8px 12px"><strong>${day}</strong></td></tr>
                <tr><td style="padding:8px 12px;color:#666">Time</td><td style="padding:8px 12px"><strong>${time}</strong></td></tr>
                <tr><td style="padding:8px 12px;color:#666">Mode</td><td style="padding:8px 12px"><strong>${mode || 'Online'}</strong></td></tr>
                <tr><td style="padding:8px 12px;color:#666">Rate</td><td style="padding:8px 12px"><strong>R${rate}/hr</strong></td></tr>
              </table>
              <a href="https://epiphanytutors.co.za" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#000;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;text-decoration:none;">View Dashboard →</a>
              <p style="color:#888;font-size:12px;margin-top:24px">— The Epiphany Team</p>
            </div>
          `
        });
      } catch(emailErr) {
        console.error('[sessions] learner email failed:', emailErr.message);
      }

      // Send notification to tutor
      if (tutorEmail) {
        try {
          await sendEmail({
            to: tutorEmail,
            subject: `New Booking — ${subject} with ${learnerName}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
                <div style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div>
                <h2 style="color:#C9A84C;font-weight:300">New Session Booked ✦</h2>
                <p>Hi ${tutorName},</p>
                <p>You have a new tutoring session booked!</p>
                <table style="width:100%;border-collapse:collapse;margin:24px 0;background:#f9f9f9;padding:16px">
                  <tr><td style="padding:8px 12px;color:#666">Learner</td><td style="padding:8px 12px"><strong>${learnerName}</strong></td></tr>
                  <tr><td style="padding:8px 12px;color:#666">Subject</td><td style="padding:8px 12px"><strong>${subject}</strong></td></tr>
                  <tr><td style="padding:8px 12px;color:#666">Day</td><td style="padding:8px 12px"><strong>${day}</strong></td></tr>
                  <tr><td style="padding:8px 12px;color:#666">Time</td><td style="padding:8px 12px"><strong>${time}</strong></td></tr>
                  <tr><td style="padding:8px 12px;color:#666">Mode</td><td style="padding:8px 12px"><strong>${mode || 'Online'}</strong></td></tr>
                </table>
                <a href="https://epiphanytutors.co.za" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#000;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;text-decoration:none;">View Dashboard →</a>
                <p style="color:#888;font-size:12px;margin-top:24px">— The Epiphany Team</p>
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
