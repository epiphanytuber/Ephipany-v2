// api/tutors.js
import { query, col, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const rows = await query(`
      SELECT t.*, s.status as sub_status
      FROM epiphany.main.tutors t
      LEFT JOIN epiphany.main.subscriptions s ON s.tutor_id = t.id
      WHERE t.status = 'Comfirmed'
        AND (s.status IN ('trial','active') OR s.id IS NULL)
      ORDER BY t.rating DESC
    `);

    const tutors = rows.map((t, i) => {
      const modeRaw = col(t,'teaching_mode') || 'Online';
      const mode = modeRaw === 'Both' ? ['In-Person','Online'] : [modeRaw];
      const avail = (col(t,'availability')||'').split(',').map(d=>d.trim())
        .filter(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d));
      return {
        id: i+1, dbId: String(col(t,'id')||''),
        name: col(t,'full_name')||'',
        photo: col(t,'photo_url')||`https://i.pravatar.cc/400?img=${(i%70)+1}`,
        subjects: (col(t,'primary_subject')||'General').split(',').map(s=>s.trim()),
        grade: col(t,'grade_level')||'All grades',
        bio: col(t,'bio')||'Experienced educator.',
        longBio: col(t,'bio')||'Experienced educator.',
        rate: parseFloat(col(t,'hourly_rate'))||0,
        rating: parseFloat(col(t,'rating'))||4.8,
        reviews: parseInt(col(t,'reviews_count'))||0,
        sessions: parseInt(col(t,'sessions_count'))||0,
        availability: avail.length ? avail : ['Mon','Wed','Fri'],
        location: col(t,'city')||'South Africa',
        mode, badge: null, languages: ['English'],
        qualifications: (col(t,'qualification')||'').split(',').map(q=>q.trim()).filter(Boolean),
        testimonials: [], subStatus: col(t,'sub_status')||'none',
      };
    });

    return ok(res, { success: true, tutors });
  } catch(e) {
    console.error('[tutors]', e.message);
    return err(res, 'Failed to load tutors', 500);
  }
}
