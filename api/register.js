// api/register.js
import { query, esc, hashPassword, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { type, first, last, email, phone, password, grade, location, subjects,
          city, teachingMode, subject, gradeLevel, rate, qual, availability, bio } = req.body || {};

  if (!first || !last || !email || !password) return err(res, 'Missing required fields');
  if (password.length < 6) return err(res, 'Password must be at least 6 characters');

  const fullName = `${first} ${last}`.trim();
  const emailLower = email.toLowerCase().trim();
  const passwordHash = hashPassword(password);

  try {
    if (type === 'learner') {
      const existing = await query(`SELECT id FROM epiphany.main.users WHERE email = '${esc(emailLower)}'`);
      if (existing.length > 0) return err(res, 'An account with this email already exists');

      await query(`INSERT INTO epiphany.main.users
        (full_name, email, phone, password_hash, grade, location, subjects, account_type, status)
        VALUES ('${esc(fullName)}','${esc(emailLower)}','${esc(phone)}',
          '${esc(passwordHash)}','${esc(grade)}','${esc(location)}','${esc(subjects)}','learner','active')`);

      const rows = await query(`SELECT id, full_name, email FROM epiphany.main.users WHERE email = '${esc(emailLower)}'`);
      return ok(res, { success: true, user: rows[0] || {} });

    } else if (type === 'tutor') {
      const existing = await query(`SELECT id FROM epiphany.main.tutors WHERE email = '${esc(emailLower)}'`);
      if (existing.length > 0) return err(res, 'A tutor account with this email already exists');

      await query(`INSERT INTO epiphany.main.tutors
        (full_name, email, phone, city, teaching_mode, primary_subject,
         grade_level, hourly_rate, qualification, availability, bio, password_hash, status)
        VALUES ('${esc(fullName)}','${esc(emailLower)}','${esc(phone)}',
          '${esc(city)}','${esc(teachingMode||'Online')}','${esc(subject)}',
          '${esc(gradeLevel)}',${parseFloat(rate)||0},'${esc(qual)}',
          '${esc(availability)}','${esc(bio)}','${esc(passwordHash)}','Pending')`);

      // Send admin email
      try {
        const rows = await query(`SELECT id FROM epiphany.main.tutors WHERE email = '${esc(emailLower)}'`);
        const tutorId = rows[0]?.id || rows[0]?.[0];
        const siteUrl = process.env.SITE_URL || '';
        const adminEmail = process.env.ADMIN_EMAIL;
        if (adminEmail && tutorId) {
          const { sendEmail, tutorApplicationEmail } = await import('./_email.js');
          await sendEmail({
            to: adminEmail,
            subject: `New Tutor Application — ${fullName}`,
            html: tutorApplicationEmail({
              tutor: { name:fullName, email, phone, subject, city, rate:parseFloat(rate)||0, qual, availability, bio },
              approveUrl: `${siteUrl}/api/approve-tutor?id=${tutorId}&action=approve`,
              rejectUrl:  `${siteUrl}/api/approve-tutor?id=${tutorId}&action=reject`,
            }),
          });
        }
      } catch(e) { console.error('[register] email error:', e.message); }

      return ok(res, { success: true, message: 'Application received. We will review and be in touch.' });

    } else {
      return err(res, 'Invalid account type');
    }
  } catch(e) {
    console.error('[register]', e.message);
    return err(res, `Registration failed: ${e.message}`, 500);
  }
}
