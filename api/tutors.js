// api/tutors.js
import { query, col, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return err(res, 'Method not allowed', 405);

  try {
    const rows = await query(`
      SELECT t.id, t.full_name, t.city, t.teaching_mode, t.primary_subject,
             t.grade_level, CAST(t.hourly_rate AS DOUBLE) as hourly_rate,
             t.qualification, t.availability, t.bio, t.photo_url,
             CAST(t.rating AS DOUBLE) as rating,
             t.reviews_count, t.sessions_count, s.status as sub_status
      FROM epiphany.main.tutors t
      LEFT JOIN epiphany.main.subscriptions s ON s.tutor_id = t.id
      WHERE t.status = 'Comfirmed'
        AND (s.status IN ('trial','active') OR s.id IS NULL)
      ORDER BY t.rating DESC, t.sessions_count DESC
    `);

    const tutors = rows.map((t, i) => {
      const name = col(t,'full_name') || '';
      const modeRaw = col(t,'teaching_mode') || 'Online';
      const mode = modeRaw === 'Both' ? ['In-Person','Online'] : [modeRaw];
      const avail = (col(t,'availability')||'').split(',').map(d=>d.trim())
        .filter(d=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(d));

      // Parse rate carefully — DuckDB DECIMAL can come back as string or number
      const rawRate = col(t,'hourly_rate');
      const rate = rawRate !== null && rawRate !== undefined ? Number(rawRate) : 0;

      const rawRating = col(t,'rating');
      const rating = rawRating !== null && rawRating !== undefined ? Number(rawRating) : 4.8;

      return {
        id:            i + 1,
        name,
        photo:         col(t,'photo_url') || '',
        subjects:      (col(t,'primary_subject')||'General').split(',').map(s=>s.trim()),
        grade:         col(t,'grade_level') || 'All grades',
        bio:           col(t,'bio') || 'Experienced educator passionate about student success.',
        longBio:       col(t,'bio') || 'Experienced educator passionate about student success.',
        rate:          isNaN(rate) ? 0 : rate,
        rating:        isNaN(rating) ? 4.8 : rating,
        reviews:       parseInt(col(t,'reviews_count')) || 0,
        sessions:      parseInt(col(t,'sessions_count')) || 0,
        availability:  avail.length ? avail : ['Mon','Wed','Fri'],
        location:      col(t,'city') || 'South Africa',
        mode,
        badge:         null,
        languages:     ['English'],
        qualifications:(col(t,'qualification')||'').split(',').map(q=>q.trim()).filter(Boolean),
        testimonials:  [],
        email:         col(t,'email') || '',
      };
    });

    return ok(res, { success: true, tutors });
  } catch(e) {
    console.error('[tutors]', e.message);
    return err(res, 'Failed to load tutors: ' + e.message, 500);
  }
}
