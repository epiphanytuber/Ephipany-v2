// api/admin.js
// Handles: approve-tutor, stats, subscription management
// GET /api/admin?action=approve|reject&id=xxx
// GET /api/admin?action=stats

import jwt from 'jsonwebtoken';
import { query, esc, ok, err, cors } from './_db.js';
import { sendEmail } from './_email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'epiphany_jwt_secret_2024';
const SITE_URL   = process.env.SITE_URL   || 'https://epiphanytutors.co.za';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const action = req.query?.action || req.body?.action;

  // ── STATS (GET) ────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'stats') {
    try {
      const rows = await query(`SELECT (SELECT COUNT(*) FROM epiphany.main.tutors WHERE status='Comfirmed') as tutor_count,(SELECT COUNT(*) FROM epiphany.main.users WHERE status='active') as student_count,(SELECT COUNT(*) FROM epiphany.main.sessions) as session_count,(SELECT COUNT(DISTINCT primary_subject) FROM epiphany.main.tutors WHERE status='Comfirmed') as subject_count`);
      const r = rows[0]||{};
      return ok(res,{tutors:Number(r.tutor_count||r[0]||0),students:Number(r.student_count||r[1]||0),sessions:Number(r.session_count||r[2]||0),subjects:Number(r.subject_count||r[3]||0)});
    } catch(e) { return ok(res,{tutors:0,students:0,sessions:0,subjects:0}); }
  }

  // ── APPROVE / REJECT (GET) ─────────────────────────────────────
  if (req.method === 'GET' && (action === 'approve' || action === 'reject')) {
    const { id } = req.query||{};
    if (!id) { res.status(400).send('Missing id'); return; }
    try {
      const tutors = await query(`SELECT id,full_name,email FROM epiphany.main.tutors WHERE id='${esc(id)}'`);
      if (!tutors.length) { res.status(404).send('Tutor not found'); return; }
      const t = tutors[0];
      const name  = t.full_name||t[1]||'Tutor';
      const email = t.email    ||t[2]||'';

      if (action === 'approve') {
        await query(`UPDATE epiphany.main.tutors SET status='Comfirmed' WHERE id='${esc(id)}'`);
        const existing = await query(`SELECT id FROM epiphany.main.subscriptions WHERE tutor_id='${esc(id)}'`);
        if (!existing.length) {
          const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate()+30);
          await query(`INSERT INTO epiphany.main.subscriptions (id,tutor_id,status,trial_start,trial_end,next_billing,amount,created_at,updated_at) VALUES ('sub-${esc(id)}','${esc(id)}','trial',NOW(),'${trialEnd.toISOString()}','${trialEnd.toISOString()}',250.00,NOW(),NOW())`);
        }
        const magicToken = jwt.sign({tutorId:id,type:'magic'},JWT_SECRET,{expiresIn:'7d'});
        const magicLink = `${SITE_URL}/api/auth?action=magic-login&token=${magicToken}`;
        if (email) {
          await sendEmail({to:email,subject:'Welcome to Epiphany Tutors — Application Approved! ✦',html:`<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0a0a0a;color:#FAF9F6"><div style="font-family:Georgia,serif;font-size:28px;letter-spacing:8px;color:#C9A84C;margin-bottom:24px">EPIPHANY</div><h2 style="color:#C9A84C;font-weight:300">Welcome aboard, ${name}! ✦</h2><p style="color:#aaa;line-height:1.8;margin-bottom:24px">Your tutor application has been <strong style="color:#4caf7d">approved</strong>. Your profile is now live and learners can start booking sessions with you.</p><div style="background:#1a1a1a;border:1px solid rgba(201,168,76,.2);padding:24px;margin-bottom:24px"><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:8px">Your Free Trial</div><div style="font-family:Georgia,serif;font-size:22px;color:#C9A84C;margin-bottom:8px">30 Days Free</div><div style="font-size:13px;color:#aaa">After your trial, it is just <strong style="color:#FAF9F6">R250/month</strong> to stay active.</div></div><div style="text-align:center;margin:32px 0"><a href="${magicLink}" style="display:inline-block;padding:16px 40px;background:#C9A84C;color:#000;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;text-decoration:none;">Go to My Dashboard →</a></div><div style="font-size:11px;color:#666;text-align:center">This link signs you in automatically. Valid for 7 days.</div></div>`}).catch(console.error);
        }
        res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-family:Georgia,serif;font-size:28px;color:#C9A84C;margin-bottom:12px">✦ Approved!</div><p style="color:#aaa">${name} has been approved and a welcome email sent.</p></div></body></html>`);
      } else {
        await query(`UPDATE epiphany.main.tutors SET status='Rejected' WHERE id='${esc(id)}'`);
        if (email) await sendEmail({to:email,subject:'Epiphany Tutors — Application Update',html:`<div style="font-family:sans-serif;padding:32px"><p>Hi ${name},</p><p>Thank you for applying. Unfortunately we are unable to approve your profile at this time. You are welcome to reapply in the future.</p><p style="color:#888;font-size:12px">— The Epiphany Team</p></div>`}).catch(console.error);
        res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#FAF9F6;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-family:Georgia,serif;font-size:28px;color:#e05c5c;margin-bottom:12px">Rejected</div><p style="color:#aaa">${name} has been notified.</p></div></body></html>`);
      }
    } catch(e) { console.error('[admin]',e.message); res.status(500).send('Error: '+e.message); }
    return;
  }

  // ── SUBSCRIPTION (POST) ────────────────────────────────────────
  if (req.method === 'POST' && action === 'subscription') {
    const { tutorId, subAction } = req.body||{};
    if (!tutorId) return err(res,'tutorId required');
    try {
      const now = new Date().toISOString();
      if (subAction === 'start_trial') {
        const trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate()+30);
        const existing = await query(`SELECT id FROM epiphany.main.subscriptions WHERE tutor_id='${esc(tutorId)}'`);
        if (existing.length) {
          await query(`UPDATE epiphany.main.subscriptions SET status='trial',trial_start='${now}',trial_end='${trialEnd.toISOString()}',next_billing='${trialEnd.toISOString()}',updated_at='${now}' WHERE tutor_id='${esc(tutorId)}'`);
        } else {
          await query(`INSERT INTO epiphany.main.subscriptions (id,tutor_id,status,trial_start,trial_end,next_billing,amount,created_at,updated_at) VALUES ('sub-${esc(tutorId)}','${esc(tutorId)}','trial','${now}','${trialEnd.toISOString()}','${trialEnd.toISOString()}',250.00,'${now}','${now}')`);
        }
        return ok(res,{success:true,trialEnd:trialEnd.toISOString()});
      }
      if (subAction === 'cancel') {
        await query(`UPDATE epiphany.main.subscriptions SET status='cancelled',updated_at='${now}' WHERE tutor_id='${esc(tutorId)}'`);
        return ok(res,{success:true});
      }
      return err(res,'Unknown subAction');
    } catch(e) { return err(res,'Subscription update failed: '+e.message,500); }
  }

  return err(res,'Unknown action');
}
