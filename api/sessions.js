// api/sessions.js
import { query, col, esc, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const { email, type } = req.query;
    if (!email) return err(res, 'email required');
    try {
      let rows;
      if (type === 'tutor') {
        rows = await query(`SELECT * FROM epiphany.main.sessions WHERE tutor_name IN (SELECT full_name FROM epiphany.main.tutors WHERE email = '${esc(email.toLowerCase())}') ORDER BY booked_on DESC`);
      } else {
        rows = await query(`SELECT * FROM epiphany.main.sessions WHERE learner_email = '${esc(email.toLowerCase())}' ORDER BY booked_on DESC`);
      }
      return ok(res, { success: true, sessions: rows });
    } catch(e) { return err(res, 'Failed to fetch sessions', 500); }
  }

  if (req.method === 'POST') {
    const { learnerName, learnerEmail, tutorName, subject, day, time, rate, mode } = req.body || {};
    if (!learnerName || !learnerEmail || !tutorName || !subject || !day || !time || !rate) return err(res, 'Missing fields');
    try {
      const [tutor] = await query(`SELECT id, email FROM epiphany.main.tutors WHERE full_name = '${esc(tutorName)}'`);
      const [learner] = await query(`SELECT id FROM epiphany.main.users WHERE email = '${esc(learnerEmail.toLowerCase())}'`);

      await query(`INSERT INTO epiphany.main.sessions (learner_id,learner_name,learner_email,tutor_id,tutor_name,subject,day,time,rate,mode,status) VALUES ('${esc(learner?.id||'')}','${esc(learnerName)}','${esc(learnerEmail.toLowerCase())}','${esc(tutor?.id||'')}','${esc(tutorName)}','${esc(subject)}','${esc(day)}','${esc(time)}',${parseFloat(rate)},'${esc(mode||'Online')}','confirmed')`);

      // Emails
      try {
        const { sendEmail, sessionBookedLearnerEmail, sessionBookedTutorEmail } = await import('./_email.js');
        await sendEmail({ to: learnerEmail, subject: `Session Confirmed — ${subject}`, html: sessionBookedLearnerEmail({learnerName,tutorName,subject,day,time,mode:mode||'Online',rate}) });
        if (tutor?.email) await sendEmail({ to: tutor.email, subject: `New Session — ${subject}`, html: sessionBookedTutorEmail({tutorName,learnerName,learnerEmail,subject,day,time,mode:mode||'Online',rate}) });
      } catch(e) { console.error('[sessions] email:', e.message); }

      return ok(res, { success: true });
    } catch(e) { return err(res, 'Booking failed', 500); }
  }

  return err(res, 'Method not allowed', 405);
}
