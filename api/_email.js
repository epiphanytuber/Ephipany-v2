// netlify/functions/_email.js
// Shared email helper using Resend

export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn('[Email] RESEND_API_KEY not set'); return; }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Epiphany Education <noreply@epiphanytutors.co.za>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    const data = await res.json();
    if (data.id) {
      console.log(`[Email] ✓ Sent "${subject}" to ${to}`);
    } else {
      console.error('[Email] ✗ Failed:', JSON.stringify(data));
    }
    return data;
  } catch(e) {
    console.error('[Email] Error:', e);
  }
}

// ── Email templates ───────────────────────────────────────────────

export function tutorApplicationEmail({ tutor, approveUrl, rejectUrl }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="color:#C9A84C;font-weight:300;font-size:24px">New Tutor Application</h2>
  <p style="color:#aaa;margin-bottom:24px">A new tutor has applied to join Epiphany. Please review their details below.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa;width:140px">Name</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.name}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Email</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.email}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Phone</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.phone || '—'}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Subject</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.subject || '—'}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">City</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.city || '—'}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Rate</td><td style="padding:10px;border-bottom:1px solid #222">R${tutor.rate}/hr</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Qualification</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.qual || '—'}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Availability</td><td style="padding:10px;border-bottom:1px solid #222">${tutor.availability || '—'}</td></tr>
    <tr><td style="padding:10px;color:#aaa">Bio</td><td style="padding:10px">${tutor.bio || '—'}</td></tr>
  </table>
  <div style="display:flex;gap:16px;margin-bottom:32px">
    <a href="${approveUrl}" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#080808;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px">✓ APPROVE TUTOR</a>
    <a href="${rejectUrl}" style="display:inline-block;padding:14px 32px;background:transparent;color:#e05c5c;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px;border:1px solid #e05c5c">✗ REJECT</a>
  </div>
  <p style="color:#555;font-size:12px">This email was sent by Epiphany Education platform.</p>
</div>`;
}

export function tutorApprovedEmail({ name, loginUrl }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="color:#C9A84C;font-weight:300;font-size:24px">You've been approved! 🎉</h2>
  <p style="color:#aaa;margin-bottom:16px">Hi ${name},</p>
  <p style="color:#aaa;margin-bottom:24px">Congratulations! Your tutor application has been approved. You can now sign in to your dashboard and start your free 30-day trial.</p>
  <p style="color:#aaa;margin-bottom:8px">Here's what happens next:</p>
  <ol style="color:#aaa;margin-bottom:32px;padding-left:20px">
    <li style="margin-bottom:8px">Sign in to your dashboard</li>
    <li style="margin-bottom:8px">Start your free 30-day trial</li>
    <li style="margin-bottom:8px">Your profile goes live in the catalogue</li>
    <li style="margin-bottom:8px">Students can start booking sessions with you</li>
  </ol>
  <a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#080808;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px">Sign In to Dashboard →</a>
  <p style="color:#555;font-size:12px;margin-top:32px">Welcome to the Epiphany family!</p>
</div>`;
}

export function tutorRejectedEmail({ name }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="font-weight:300;font-size:24px">Application Update</h2>
  <p style="color:#aaa;margin-bottom:16px">Hi ${name},</p>
  <p style="color:#aaa;margin-bottom:24px">Thank you for your interest in joining Epiphany Education. After careful review, we are unable to approve your application at this time.</p>
  <p style="color:#aaa;margin-bottom:24px">If you believe this is an error or would like more information, please reply to this email.</p>
  <p style="color:#555;font-size:12px">Thank you for your interest in Epiphany Education.</p>
</div>`;
}

export function sessionBookedLearnerEmail({ learnerName, tutorName, subject, day, time, mode, rate }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="color:#C9A84C;font-weight:300;font-size:24px">Session Confirmed ✓</h2>
  <p style="color:#aaa;margin-bottom:24px">Hi ${learnerName}, your session has been booked successfully!</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa;width:140px">Tutor</td><td style="padding:10px;border-bottom:1px solid #222">${tutorName}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Subject</td><td style="padding:10px;border-bottom:1px solid #222">${subject}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Day</td><td style="padding:10px;border-bottom:1px solid #222">${day}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Time</td><td style="padding:10px;border-bottom:1px solid #222">${time}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Mode</td><td style="padding:10px;border-bottom:1px solid #222">${mode}</td></tr>
    <tr><td style="padding:10px;color:#aaa">Rate</td><td style="padding:10px;color:#C9A84C;font-size:20px">R${rate}</td></tr>
  </table>
  <p style="color:#555;font-size:12px">Thank you for using Epiphany Education.</p>
</div>`;
}

export function sessionBookedTutorEmail({ tutorName, learnerName, learnerEmail, subject, day, time, mode, rate }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="color:#C9A84C;font-weight:300;font-size:24px">New Session Booked!</h2>
  <p style="color:#aaa;margin-bottom:24px">Hi ${tutorName}, a student has booked a session with you.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa;width:140px">Student</td><td style="padding:10px;border-bottom:1px solid #222">${learnerName}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Email</td><td style="padding:10px;border-bottom:1px solid #222">${learnerEmail}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Subject</td><td style="padding:10px;border-bottom:1px solid #222">${subject}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Day</td><td style="padding:10px;border-bottom:1px solid #222">${day}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Time</td><td style="padding:10px;border-bottom:1px solid #222">${time}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Mode</td><td style="padding:10px;border-bottom:1px solid #222">${mode}</td></tr>
    <tr><td style="padding:10px;color:#aaa">Rate</td><td style="padding:10px;color:#C9A84C;font-size:20px">R${rate}</td></tr>
  </table>
  <p style="color:#555;font-size:12px">Log in to your dashboard to manage this session.</p>
</div>`;
}

export function subscriptionPaymentEmail({ tutorName, amount, nextBilling }) {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#080808;color:#FAF9F6;padding:40px;">
  <div style="font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:8px">EPIPHANY</div>
  <div style="height:1px;background:#C9A84C;margin-bottom:32px;opacity:0.3"></div>
  <h2 style="color:#C9A84C;font-weight:300;font-size:24px">Payment Received ✓</h2>
  <p style="color:#aaa;margin-bottom:24px">Hi ${tutorName}, thank you for your subscription payment.</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa;width:140px">Amount Paid</td><td style="padding:10px;border-bottom:1px solid #222;color:#C9A84C;font-size:20px">R${amount}</td></tr>
    <tr><td style="padding:10px;border-bottom:1px solid #222;color:#aaa">Plan</td><td style="padding:10px;border-bottom:1px solid #222">Epiphany Tutor Subscription</td></tr>
    <tr><td style="padding:10px;color:#aaa">Next Billing</td><td style="padding:10px">${nextBilling}</td></tr>
  </table>
  <p style="color:#aaa;margin-bottom:24px">Your profile is live in the catalogue and students can book sessions with you.</p>
  <p style="color:#555;font-size:12px">Thank you for being part of Epiphany Education.</p>
</div>`;
}
