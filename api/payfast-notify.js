// api/payfast-notify.js
// PayFast sends a POST to this URL after every payment (initial + recurring)
// This is the webhook that keeps subscriptions alive automatically

import crypto from 'crypto';
import { query, esc, ok, err } from './_db.js';
import { sendEmail } from './_email.js';

const PAYFAST_PASSPHRASE = process.env.PAYFAST_PASSPHRASE;
const PAYFAST_SANDBOX    = process.env.PAYFAST_SANDBOX !== 'false';

// PayFast IP addresses to whitelist
const PAYFAST_IPS = [
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '196.33.227.144',  '196.33.227.145',  '196.33.227.146',  '196.33.227.147',
  // Sandbox IPs
  '197.97.145.148', '197.97.145.149',
];

function verifySignature(data, passphrase) {
  const received = data.signature;
  const dataWithout = { ...data };
  delete dataWithout.signature;

  let str = Object.entries(dataWithout)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`)
    .join('&');

  if (passphrase) {
    str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }
  const expected = crypto.createHash('md5').update(str).digest('hex');
  return expected === received;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const data = req.body || {};
  console.log('[payfast-notify] Received:', JSON.stringify(data));

  // 1. Verify IP (skip in sandbox)
  if (!PAYFAST_SANDBOX) {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const clientIp = ip.split(',')[0].trim();
    if (!PAYFAST_IPS.includes(clientIp)) {
      console.error('[payfast-notify] Invalid IP:', clientIp);
      res.status(403).end('Invalid IP');
      return;
    }
  }

  // 2. Verify signature
  if (!verifySignature(data, PAYFAST_PASSPHRASE)) {
    console.error('[payfast-notify] Invalid signature');
    res.status(400).end('Invalid signature');
    return;
  }

  // 3. Check payment status
  const {
    payment_status,    // COMPLETE, FAILED, CANCELLED
    m_payment_id,      // our reference e.g. SUB-tutorId-timestamp
    custom_str1,       // tutorId (we'll set this via custom fields)
    email_address,     // tutor email
    token,             // PayFast subscription token for future charges
    amount_gross,      // amount charged
  } = data;

  // Extract tutorId from m_payment_id: SUB-{tutorId}-{timestamp}
  const parts = (m_payment_id || '').split('-');
  const tutorId = parts.length >= 3 ? parts.slice(1, -1).join('-') : null;

  if (!tutorId && !email_address) {
    console.error('[payfast-notify] Cannot identify tutor');
    res.status(200).end('OK'); // Always return 200 to PayFast
    return;
  }

  try {
    if (payment_status === 'COMPLETE') {
      const now = new Date().toISOString();
      const paymentType = data.custom_str2 || '';

      // ── SESSION PAYMENT ────────────────────────────────────────
      if (paymentType === 'session') {
        const sId = data.custom_str1 || '';
        if (sId) {
          // Confirm the session
          await query(`UPDATE epiphany.main.sessions SET status='confirmed' WHERE id='${esc(sId)}'`);

          // Get session details for emails
          const sessions = await query(`SELECT learner_name,learner_email,tutor_name,subject,day,time,mode,rate FROM epiphany.main.sessions WHERE id='${esc(sId)}'`);
          if (sessions.length > 0) {
            const s = sessions[0];
            const lName  = s.learner_name||s[0]||'';
            const lEmail = s.learner_email||s[1]||'';
            const tName  = s.tutor_name||s[2]||'';
            const subj   = s.subject||s[3]||'';
            const day    = s.day||s[4]||'';
            const time   = s.time||s[5]||'';
            const mode   = s.mode||s[6]||'';
            const rate   = s.rate||s[7]||0;

            const emailHtml = (to, greeting, desc) => `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px"><div style="font-family:Georgia,serif;font-size:24px;letter-spacing:6px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div><h2 style="color:#C9A84C;font-weight:300">Session Confirmed ✦</h2><p>Hi ${greeting},</p><p>${desc}</p><table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f9f9f9;padding:16px"><tr><td style="padding:8px;color:#666">Subject</td><td><strong>${subj}</strong></td></tr><tr><td style="padding:8px;color:#666">Day</td><td><strong>${day}</strong></td></tr><tr><td style="padding:8px;color:#666">Time</td><td><strong>${time}</strong></td></tr><tr><td style="padding:8px;color:#666">Mode</td><td><strong>${mode}</strong></td></tr><tr><td style="padding:8px;color:#666">Amount Paid</td><td><strong>R${rate}</strong></td></tr></table><a href="https://epiphanytutors.co.za" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#000;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;text-decoration:none;">View Dashboard →</a><p style="color:#888;font-size:12px;margin-top:24px">— The Epiphany Team</p></div>`;

            try { await sendEmail({ to: lEmail, subject: 'Session Confirmed — Payment Received ✦', html: emailHtml(lEmail, lName, `Your payment has been received and your session with <strong>${tName}</strong> is now confirmed!`) }); } catch(e) {}

            // Get tutor email
            try {
              const tutors = await query(`SELECT email FROM epiphany.main.tutors WHERE full_name='${esc(tName)}' LIMIT 1`);
              const tEmail = tutors.length ? (tutors[0].email||tutors[0][0]) : null;
              if (tEmail) await sendEmail({ to: tEmail, subject: `New Confirmed Session — ${subj} with ${lName}`, html: emailHtml(tEmail, tName, `A learner <strong>${lName}</strong> has paid and confirmed their session with you.`) });
            } catch(e) {}
          }
        }
        res.status(200).end('OK');
        return;
      }

      // ── SUBSCRIPTION PAYMENT ───────────────────────────────────
      const nextBilling = new Date();
      nextBilling.setMonth(nextBilling.getMonth() + 1);

      if (tutorId) {
        // Update subscription in MotherDuck
        await query(`
          UPDATE epiphany.main.subscriptions
          SET status = 'active',
              payfast_token = '${esc(token || '')}',
              next_billing = '${nextBilling.toISOString()}',
              updated_at = '${now}'
          WHERE tutor_id = '${esc(tutorId)}'
        `);

        // Get tutor info for email
        const tutors = await query(
          `SELECT full_name, email FROM epiphany.main.tutors WHERE id = '${esc(tutorId)}'`
        );

        if (tutors.length > 0) {
          const tutor = tutors[0];
          const name = tutor.full_name || tutor[0] || 'Tutor';
          const email = tutor.email || tutor[1] || email_address;

          // Send payment confirmation email
          try {
            await sendEmail({
              to: email,
              subject: 'Payment Confirmed — Epiphany Tutors Subscription',
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px">
                  <h2 style="color:#C9A84C">Payment Confirmed ✦</h2>
                  <p>Hi ${name},</p>
                  <p>Your monthly subscription payment of <strong>R${amount_gross || '250.00'}</strong> has been received.</p>
                  <p>Your profile will remain active and visible to learners.</p>
                  <table style="width:100%;border-collapse:collapse;margin:24px 0">
                    <tr><td style="padding:8px 0;color:#888">Amount</td><td><strong>R${amount_gross || '250.00'}</strong></td></tr>
                    <tr><td style="padding:8px 0;color:#888">Next billing</td><td><strong>${nextBilling.toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric'})}</strong></td></tr>
                    <tr><td style="padding:8px 0;color:#888">Status</td><td style="color:#4caf7d"><strong>Active</strong></td></tr>
                  </table>
                  <p>Log in at <a href="https://epiphanytutors.co.za" style="color:#C9A84C">epiphanytutors.co.za</a> to manage your subscription.</p>
                  <p style="color:#888;font-size:12px">— The Epiphany Team</p>
                </div>
              `
            });
          } catch(emailErr) {
            console.error('[payfast-notify] Email failed:', emailErr.message);
          }
        }
      } else if (email_address) {
        // Fallback: find tutor by email
        await query(`
          UPDATE epiphany.main.subscriptions s
          SET status = 'active',
              payfast_token = '${esc(token || '')}',
              next_billing = '${nextBilling.toISOString()}',
              updated_at = '${now}'
          FROM epiphany.main.tutors t
          WHERE s.tutor_id = t.id AND t.email = '${esc(email_address)}'
        `);
      }

    } else if (payment_status === 'FAILED' || payment_status === 'CANCELLED') {
      // Payment failed — mark subscription as expired
      if (tutorId) {
        await query(`
          UPDATE epiphany.main.subscriptions
          SET status = 'expired', updated_at = '${new Date().toISOString()}'
          WHERE tutor_id = '${esc(tutorId)}'
        `);
      }
      console.log(`[payfast-notify] Payment ${payment_status} for tutor ${tutorId}`);
    }

  } catch(dbErr) {
    console.error('[payfast-notify] DB error:', dbErr.message);
  }

  // Always return 200 OK to PayFast — even on errors
  res.status(200).end('OK');
}
