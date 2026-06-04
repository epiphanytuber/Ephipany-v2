// api/stats.js — returns live platform stats for homepage
import { query, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const rows = await query(`
      SELECT
        (SELECT COUNT(*) FROM epiphany.main.tutors WHERE status = 'Comfirmed') as tutor_count,
        (SELECT COUNT(*) FROM epiphany.main.users WHERE status = 'active') as student_count,
        (SELECT COUNT(*) FROM epiphany.main.sessions) as session_count,
        (SELECT COUNT(DISTINCT primary_subject) FROM epiphany.main.tutors WHERE status = 'Comfirmed') as subject_count
    `);

    const r = rows[0] || {};
    return ok(res, {
      tutors:   Number(r.tutor_count   || r[0] || 0),
      students: Number(r.student_count || r[1] || 0),
      sessions: Number(r.session_count || r[2] || 0),
      subjects: Number(r.subject_count || r[3] || 0),
    });
  } catch(e) {
    console.error('[stats]', e.message);
    return ok(res, { tutors: 0, students: 0, sessions: 0, subjects: 0 });
  }
}
