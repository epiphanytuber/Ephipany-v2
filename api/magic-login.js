// api/magic-login.js
// GET /api/magic-login?token=xxx
// Tutor clicks link in approval email → auto signs them in → redirects to dashboard

import { query, esc } from './_db.js';
import jwt from 'jsonwebtoken';

const SITE_URL   = process.env.SITE_URL || 'https://epiphanytutors.co.za';
const JWT_SECRET = process.env.JWT_SECRET || 'epiphany_jwt_secret_2024';

export default async function handler(req, res) {
  const { token } = req.query || {};

  if (!token) {
    res.writeHead(302, { Location: SITE_URL });
    res.end();
    return;
  }

  try {
    // Verify the magic token
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'magic' || !decoded.tutorId) {
      throw new Error('Invalid magic token');
    }

    // Find the tutor
    const tutors = await query(
      `SELECT id, full_name, email, status FROM epiphany.main.tutors
       WHERE id = '${esc(decoded.tutorId)}' AND status = 'Comfirmed'`
    );

    if (!tutors.length) {
      // Tutor not found or not approved — redirect to homepage
      res.writeHead(302, { Location: SITE_URL });
      res.end();
      return;
    }

    // Generate a real session JWT
    const sessionToken = jwt.sign(
      { id: decoded.tutorId, type: 'tutor' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Update last_login and session_token
    await query(
      `UPDATE epiphany.main.tutors
       SET session_token = '${esc(sessionToken)}', last_login = NOW()
       WHERE id = '${esc(decoded.tutorId)}'`
    );

    // Set cookies and redirect to dashboard
    const cookieOpts = 'Path=/; Max-Age=2592000; SameSite=Lax';
    res.setHeader('Set-Cookie', [
      `epiphany_token=${sessionToken}; ${cookieOpts}`,
      `epiphany_type=tutor; ${cookieOpts}`,
      `epiphany_dash=tutor; ${cookieOpts}`,
    ]);

    // Redirect to site — cookies will auto-restore the session
    res.writeHead(302, { Location: SITE_URL });
    res.end();

  } catch(e) {
    console.error('[magic-login]', e.message);
    res.writeHead(302, { Location: SITE_URL });
    res.end();
  }
}
