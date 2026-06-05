// api/subscribe.js
// Handles both tutor subscriptions AND one-time session payments
// POST /api/subscribe { type: 'session'|'subscription', ... }

import crypto from 'crypto';
import { query, esc, ok, err, cors } from './_db.js';

const PAYFAST_MERCHANT_ID  = process.env.PAYFAST_MERCHANT_ID;
const PAYFAST_MERCHANT_KEY = process.env.PAYFAST_MERCHANT_KEY;
const PAYFAST_PASSPHRASE   = process.env.PAYFAST_PASSPHRASE;
const PAYFAST_SANDBOX      = process.env.PAYFAST_SANDBOX !== 'false';
const SITE_URL             = process.env.SITE_URL || 'https://epiphanytutors.co.za';

const PAYFAST_URL = PAYFAST_SANDBOX
  ? 'https://sandbox.payfast.co.za/eng/process'
  : 'https://www.payfast.co.za/eng/process';

function generateSignature(data, passphrase) {
  let str = Object.entries(data)
    .filter(([, v]) => v !== '' && v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`)
    .join('&');
  if (passphrase) {
    str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`;
  }
  return crypto.createHash('md5').update(str).digest('hex');
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { type, tutorId, tutorEmail, tutorName, sessionId, amount, itemName } = req.body || {};

  try {
    // ── SESSION PAYMENT (one-time) ──────────────────────────────
    if (type === 'session') {
      if (!sessionId || !tutorEmail) return err(res, 'sessionId and tutorEmail required');

      const data = {
        merchant_id:   PAYFAST_MERCHANT_ID,
        merchant_key:  PAYFAST_MERCHANT_KEY,
        return_url:    `${SITE_URL}/api/payfast-notify?type=session&sessionId=${encodeURIComponent(sessionId)}`,
        cancel_url:    `${SITE_URL}`,
        notify_url:    `${SITE_URL}/api/payfast-notify`,
        email_address: tutorEmail,
        name_first:    (tutorName || '').split(' ')[0] || 'Learner',
        name_last:     (tutorName || '').split(' ').slice(1).join(' ') || ' ',
        m_payment_id:  `SESSION-${sessionId}`,
        amount:        parseFloat(amount || 0).toFixed(2),
        item_name:     itemName || 'Epiphany Tutoring Session',
        custom_str1:   sessionId,
        custom_str2:   'session',
      };
      data.signature = generateSignature(data, PAYFAST_PASSPHRASE);
      return ok(res, { payfastUrl: PAYFAST_URL, formData: data });
    }

    // ── TUTOR SUBSCRIPTION (recurring) ─────────────────────────
    if (!tutorId || !tutorEmail) return err(res, 'tutorId and tutorEmail required');

    const data = {
      merchant_id:      PAYFAST_MERCHANT_ID,
      merchant_key:     PAYFAST_MERCHANT_KEY,
      return_url:       `${SITE_URL}/api/subscribe-success?tutorId=${encodeURIComponent(tutorId)}`,
      cancel_url:       `${SITE_URL}`,
      notify_url:       `${SITE_URL}/api/payfast-notify`,
      email_address:    tutorEmail,
      name_first:       (tutorName || '').split(' ')[0] || 'Tutor',
      name_last:        (tutorName || '').split(' ').slice(1).join(' ') || ' ',
      m_payment_id:     `SUB-${tutorId}-${Date.now()}`,
      amount:           '250.00',
      item_name:        'Epiphany Tutors — Monthly Subscription',
      subscription_type:'1',
      billing_date:     new Date().toISOString().split('T')[0],
      recurring_amount: '250.00',
      frequency:        '3',
      cycles:           '0',
      custom_str1:      tutorId,
      custom_str2:      'subscription',
    };
    data.signature = generateSignature(data, PAYFAST_PASSPHRASE);
    return ok(res, { payfastUrl: PAYFAST_URL, formData: data });

  } catch(e) {
    console.error('[subscribe]', e.message);
    return err(res, 'Failed to initiate payment', 500);
  }
}
