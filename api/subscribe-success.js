// api/subscribe-success.js
// PayFast redirects here after successful payment
// GET /api/subscribe-success?tutorId=xxx

import { query, esc } from './_db.js';

const SITE_URL = process.env.SITE_URL || 'https://epiphanytutors.co.za';

export default async function handler(req, res) {
  const { tutorId } = req.query || {};

  if (tutorId) {
    try {
      // Mark as active immediately (notify webhook will also fire)
      const nextBilling = new Date();
      nextBilling.setMonth(nextBilling.getMonth() + 1);
      await query(`
        UPDATE epiphany.main.subscriptions
        SET status = 'active', next_billing = '${nextBilling.toISOString()}', updated_at = NOW()
        WHERE tutor_id = '${esc(tutorId)}'
      `);
    } catch(e) {
      console.error('[subscribe-success]', e.message);
    }
  }

  // Redirect back to website — tutor will see active subscription
  res.writeHead(302, { Location: SITE_URL });
  res.end();
}
