// api/approve-tutor.js
// GET /api/approve-tutor?id=xxx&action=approve|reject
// Admin clicks link from email to approve or reject a tutor

import { query, esc } from './_db.js';
import { sendEmail } from './_email.js';
import jwt from 'jsonwebtoken';

const SITE_URL   = process.env.SITE_URL || 'https://epiphanytutors.co.za';
const JWT_SECRET = process.env.JWT_SECRET || 'epiphany_jwt_secret_2024';

export default async function handler(req, res) {
  const { id, action } = req.query || {};

  if (!id || !action) {
    res.status(400).send('Missing id or action');
    return;
  }

  try {
    // Find the tutor
    const tutors = await query(
      `SELECT id, full_name, email FROM epiphany.main.tutors WHERE id = '${esc(id)}'`
    );

    if (!tutors.length) {
      res.status(404).send('Tutor not found');
      return;
    }

    const tutor = tutors[0];
    const name  = tutor.full_name || tutor[1] || 'Tutor';
    const email = tutor.email     || tutor[2] || '';

    if (action === 'approve') {
      // Approve the tutor
      await query(
        `UPDATE epiphany.main.tutors SET status = 'Comfirmed' WHERE id = '${esc(id)}'`
      );

      // Create subscription record (start trial)
      const existing = await query(
        `SELECT id FROM epiphany.main.subscriptions WHERE tutor_id = '${esc(id)}'`
      );
      if (!existing.length) {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 30);
        await query(`
          INSERT INTO epiphany.main.subscriptions (id, tutor_id, status, trial_start, trial_end, next_billing, amount, created_at, updated_at)
          VALUES (
            '${esc('sub-' + id)}', '${esc(id)}', 'trial',
            NOW(), '${trialEnd.toISOString()}', '${trialEnd.toISOString()}',
            250.00, NOW(), NOW()
          )
        `);
      }

      // Generate magic login token (valid 7 days)
      const magicToken = jwt.sign(
        { tutorId: id, type: 'magic' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const magicLink = `${SITE_URL}/api/magic-login?token=${magicToken}`;

      // Send welcome email to tutor with magic link
      if (email) {
        await sendEmail({
          to: email,
          subject: 'Welcome to Epiphany Tutors — Your Application is Approved! ✦',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#FAF9F6">
              <div style="text-align:center;margin-bottom:32px">
                <div style="font-family:Georgia,serif;font-size:32px;letter-spacing:8px;color:#C9A84C">EPIPHANY</div>
                <div style="font-size:11px;letter-spacing:3px;color:#888;text-transform:uppercase;margin-top:4px">Premier Tutoring Marketplace</div>
              </div>
              <h2 style="color:#C9A84C;font-family:Georgia,serif;font-weight:300;font-size:28px;margin-bottom:8px">Welcome aboard, ${name}! ✦</h2>
              <p style="color:#aaa;line-height:1.8;margin-bottom:24px">
                We're thrilled to let you know that your tutor application has been <strong style="color:#4caf7d">approved</strong>. 
                Your profile is now live on the Epiphany platform and learners can start booking sessions with you.
              </p>
              <div style="background:#1a1a1a;border:1px solid rgba(201,168,76,.2);padding:24px;margin-bottom:24px">
                <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:12px">Your Free Trial</div>
                <div style="font-family:Georgia,serif;font-size:22px;color:#C9A84C;margin-bottom:8px">30 Days Free</div>
                <div style="font-size:13px;color:#aaa;line-height:1.7">
                  You have a 30-day free trial to get started. After that, it's just 
                  <strong style="color:#FAF9F6">R250/month</strong> to keep your profile active.
                </div>
              </div>
              <div style="text-align:center;margin:32px 0">
                <a href="${magicLink}" 
                   style="display:inline-block;padding:16px 40px;background:#C9A84C;color:#000;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;text-decoration:none;">
                  Go to My Dashboard →
                </a>
              </div>
              <div style="font-size:11px;color:#666;text-align:center;margin-top:8px">
                This link will sign you in automatically. Valid for 7 days.<br/>
                After that, visit <a href="${SITE_URL}" style="color:#C9A84C">${SITE_URL}</a> and sign in with your email and password.
              </div>
              <hr style="border:none;border-top:1px solid #222;margin:32px 0"/>
              <p style="font-size:12px;color:#666;text-align:center">
                Questions? Reply to this email or visit ${SITE_URL}<br/>
                — The Epiphany Team
              </p>
            </div>
          `
        });
      }

      res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
          <div style="text-align:center;padding:40px">
            <div style="font-family:Georgia,serif;font-size:28px;color:#C9A84C;margin-bottom:12px">✦ Approved!</div>
            <p style="color:#aaa">${name} has been approved and a welcome email sent.</p>
            <p style="color:#666;font-size:13px">Their 30-day free trial has started.</p>
          </div>
        </body></html>
      `);

    } else if (action === 'reject') {
      // Reject the tutor
      await query(
        `UPDATE epiphany.main.tutors SET status = 'Rejected' WHERE id = '${esc(id)}'`
      );

      // Send rejection email
      if (email) {
        await sendEmail({
          to: email,
          subject: 'Epiphany Tutors — Application Update',
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
              <div style="font-family:Georgia,serif;font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div>
              <p>Hi ${name},</p>
              <p style="line-height:1.8;color:#666">
                Thank you for applying to join Epiphany Tutors. After reviewing your application, 
                we are unable to approve your profile at this time.
              </p>
              <p style="line-height:1.8;color:#666">
                You're welcome to reapply in the future. If you have any questions, please reply to this email.
              </p>
              <p style="color:#888;font-size:12px;margin-top:32px">— The Epiphany Team</p>
            </div>
          `
        });
      }

      res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
          <div style="text-align:center;padding:40px">
            <div style="font-family:Georgia,serif;font-size:28px;color:#e05c5c;margin-bottom:12px">Application Rejected</div>
            <p style="color:#aaa">${name} has been notified.</p>
          </div>
        </body></html>
      `);
    } else {
      res.status(400).send('Invalid action');
    }

  } catch(e) {
    console.error('[approve-tutor]', e.message);
    res.status(500).send('Error: ' + e.message);
  }
}
