// api/auth.js
// Handles: login, register, session restore, reset-password, magic-login
// POST /api/auth?action=login|register|session|reset-password
// GET  /api/auth?action=magic-login&token=xxx

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query, esc, hashPassword, ok, err, cors } from './_db.js';
import { sendEmail } from './_email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'epiphany_jwt_secret_2024';
const SITE_URL   = process.env.SITE_URL   || 'https://epiphanytutors.co.za';
const ADMIN_EMAIL= process.env.ADMIN_EMAIL|| '';

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const action = req.query?.action || req.body?.action;

  // ── MAGIC LOGIN (GET) ──────────────────────────────────────────
  if (req.method === 'GET' && action === 'magic-login') {
    const { token } = req.query || {};
    if (!token) { res.writeHead(302,{Location:SITE_URL});res.end();return; }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'magic' || !decoded.tutorId) throw new Error('Invalid');
      const tutors = await query(`SELECT id FROM epiphany.main.tutors WHERE id='${esc(decoded.tutorId)}' AND status='Comfirmed'`);
      if (!tutors.length) { res.writeHead(302,{Location:SITE_URL});res.end();return; }
      const sessionToken = jwt.sign({id:decoded.tutorId,type:'tutor'},JWT_SECRET,{expiresIn:'30d'});
      await query(`UPDATE epiphany.main.tutors SET session_token='${esc(sessionToken)}',last_login=NOW() WHERE id='${esc(decoded.tutorId)}'`);
      const cookieOpts = 'Path=/; Max-Age=2592000; SameSite=Lax';
      res.setHeader('Set-Cookie',[`epiphany_token=${sessionToken}; ${cookieOpts}`,`epiphany_type=tutor; ${cookieOpts}`,`epiphany_dash=tutor; ${cookieOpts}`]);
      res.writeHead(302,{Location:SITE_URL});res.end();
    } catch(e) { res.writeHead(302,{Location:SITE_URL});res.end(); }
    return;
  }

  if (req.method !== 'POST') return err(res,'Method not allowed',405);

  // ── LOGIN ──────────────────────────────────────────────────────
  if (action === 'login') {
    const { email, password } = req.body||{};
    if (!email||!password) return err(res,'Email and password required');
    const emailLower = email.toLowerCase().trim();
    const passwordHash = hashPassword(password);
    const token = generateToken();
    const now = new Date().toISOString();
    try {
      const learners = await query(`SELECT id,full_name,email,phone,status,registered_on FROM epiphany.main.users WHERE email='${esc(emailLower)}' AND password_hash='${esc(passwordHash)}'`);
      if (learners.length > 0) {
        const u = learners[0];
        await query(`UPDATE epiphany.main.users SET session_token='${esc(token)}',last_login='${now}' WHERE email='${esc(emailLower)}'`);
        return ok(res,{type:'learner',token,user:{id:u.id||u[0],name:u.full_name||u[1],email:u.email||u[2],phone:u.phone||u[3]||'',since:u.registered_on||(u[5])||''}});
      }
      const tutors = await query(`SELECT t.id,t.full_name,t.email,t.phone,t.city,t.primary_subject,t.hourly_rate,t.bio,t.status,t.applied_on,s.status as sub_status,s.trial_start,s.trial_end,s.next_billing FROM epiphany.main.tutors t LEFT JOIN epiphany.main.subscriptions s ON s.tutor_id=t.id WHERE t.email='${esc(emailLower)}' AND t.password_hash='${esc(passwordHash)}'`);
      if (tutors.length > 0) {
        const t = tutors[0];
        const status = t.status||t[8];
        if (status !== 'Comfirmed') return err(res,'Your tutor application is still pending approval.');
        await query(`UPDATE epiphany.main.tutors SET session_token='${esc(token)}',last_login='${now}' WHERE email='${esc(emailLower)}'`);
        return ok(res,{type:'tutor',token,tutor:{id:t.id||t[0],name:t.full_name||t[1],email:t.email||t[2],phone:t.phone||t[3]||'',city:t.city||t[4]||'',subject:t.primary_subject||t[5]||'',rate:parseFloat(t.hourly_rate||t[6])||0,bio:t.bio||t[7]||'',since:t.applied_on||t[9]||''},subscription:{status:t.sub_status||t[10]||'none',trialStart:t.trial_start||t[11]||null,trialEnd:t.trial_end||t[12]||null,nextBilling:t.next_billing||t[13]||null}});
      }
      return err(res,'Incorrect email or password');
    } catch(e) { console.error('[auth/login]',e.message); return err(res,'Login failed',500); }
  }

  // ── SESSION RESTORE ────────────────────────────────────────────
  if (action === 'session') {
    const { token } = req.body||{};
    if (!token) return err(res,'Token required');
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type === 'learner') {
        const users = await query(`SELECT id,full_name,email,phone,registered_on FROM epiphany.main.users WHERE id='${esc(decoded.id)}' AND status='active'`);
        if (!users.length) return err(res,'Session expired');
        const u = users[0];
        return ok(res,{type:'learner',user:{id:u.id||u[0],name:u.full_name||u[1],email:u.email||u[2],phone:u.phone||u[3]||'',since:u.registered_on||u[4]||''}});
      }
      if (decoded.type === 'tutor') {
        const tutors = await query(`SELECT t.id,t.full_name,t.email,t.phone,t.city,t.primary_subject,t.hourly_rate,t.bio,t.applied_on,s.status,s.trial_start,s.trial_end,s.next_billing FROM epiphany.main.tutors t LEFT JOIN epiphany.main.subscriptions s ON s.tutor_id=t.id WHERE t.id='${esc(decoded.id)}' AND t.status='Comfirmed'`);
        if (!tutors.length) return err(res,'Session expired');
        const t = tutors[0];
        return ok(res,{type:'tutor',tutor:{id:t.id||t[0],name:t.full_name||t[1],email:t.email||t[2],phone:t.phone||t[3]||'',city:t.city||t[4]||'',subject:t.primary_subject||t[5]||'',rate:parseFloat(t.hourly_rate||t[6])||0,bio:t.bio||t[7]||'',since:t.applied_on||t[8]||''},subscription:{status:t.status||t[9]||'none',trialStart:t.trial_start||t[10]||null,trialEnd:t.trial_end||t[11]||null,nextBilling:t.next_billing||t[12]||null}});
      }
      return err(res,'Invalid token type');
    } catch(e) { return err(res,'Invalid or expired session'); }
  }

  // ── RESET PASSWORD ─────────────────────────────────────────────
  if (action === 'reset-password') {
    const { email, password } = req.body||{};
    if (!email||!password) return err(res,'Email and password required');
    if (password.length < 6) return err(res,'Password must be at least 6 characters');
    const emailLower = email.toLowerCase().trim();
    const passwordHash = hashPassword(password);
    try {
      const learners = await query(`SELECT id FROM epiphany.main.users WHERE email='${esc(emailLower)}'`);
      if (learners.length > 0) {
        await query(`UPDATE epiphany.main.users SET password_hash='${esc(passwordHash)}' WHERE email='${esc(emailLower)}'`);
        return ok(res,{success:true});
      }
      const tutors = await query(`SELECT id FROM epiphany.main.tutors WHERE email='${esc(emailLower)}'`);
      if (tutors.length > 0) {
        await query(`UPDATE epiphany.main.tutors SET password_hash='${esc(passwordHash)}' WHERE email='${esc(emailLower)}'`);
        return ok(res,{success:true});
      }
      return err(res,'No account found with that email');
    } catch(e) { return err(res,'Reset failed',500); }
  }

  // ── REGISTER ───────────────────────────────────────────────────
  if (action === 'register') {
    const { type, first, last, email, phone, password, grade, location, subjects, city, teachingMode, subject, gradeLevel, rate, qual, availability, bio } = req.body||{};
    if (!first||!last||!email) return err(res,'Name and email required');
    const emailLower = email.toLowerCase().trim();
    const passwordHash = hashPassword(password||'');
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      if (type === 'learner') {
        const existing = await query(`SELECT id FROM epiphany.main.users WHERE email='${esc(emailLower)}'`);
        if (existing.length > 0) return err(res,'An account with this email already exists');
        const jwtToken = jwt.sign({id,type:'learner'},JWT_SECRET,{expiresIn:'30d'});
        await query(`INSERT INTO epiphany.main.users (id,full_name,email,phone,password_hash,grade,location,subjects,account_type,status,session_token,registered_on) VALUES ('${esc(id)}','${esc((first+' '+last).trim())}','${esc(emailLower)}','${esc(phone||'')}','${esc(passwordHash)}','${esc(grade||'')}','${esc(location||'')}','${esc(subjects||'')}','learner','active','${esc(jwtToken)}','${now}')`);
        return ok(res,{success:true,token:jwtToken,type:'learner'});
      }
      if (type === 'tutor') {
        const existing = await query(`SELECT id FROM epiphany.main.tutors WHERE email='${esc(emailLower)}'`);
        if (existing.length > 0) return err(res,'A tutor with this email already exists');
        await query(`INSERT INTO epiphany.main.tutors (id,full_name,email,phone,password_hash,city,teaching_mode,primary_subject,grade_level,hourly_rate,qualification,availability,bio,status,applied_on) VALUES ('${esc(id)}','${esc((first+' '+last).trim())}','${esc(emailLower)}','${esc(phone||'')}','${esc(passwordHash)}','${esc(city||'')}','${esc(teachingMode||'Online')}','${esc(subject||'')}','${esc(gradeLevel||'')}',${parseFloat(rate)||0},'${esc(qual||'')}','${esc(availability||'')}','${esc(bio||'')}','Pending','${now}')`);
        if (ADMIN_EMAIL) {
          const approveUrl = `${SITE_URL}/api/admin?action=approve&id=${id}`;
          const rejectUrl  = `${SITE_URL}/api/admin?action=reject&id=${id}`;
          await sendEmail({to:ADMIN_EMAIL,subject:`New Tutor Application — ${first} ${last}`,html:`<div style="font-family:sans-serif;padding:32px"><h2 style="color:#C9A84C">New Tutor Application</h2><p><strong>${first} ${last}</strong> (${emailLower}) has applied to join Epiphany Tutors.</p><p><strong>Subject:</strong> ${subject}<br/><strong>City:</strong> ${city}<br/><strong>Rate:</strong> R${rate}/hr</p><div style="margin:24px 0"><a href="${approveUrl}" style="padding:12px 28px;background:#4caf7d;color:#fff;text-decoration:none;font-weight:700;margin-right:12px">✓ Approve</a><a href="${rejectUrl}" style="padding:12px 28px;background:#e05c5c;color:#fff;text-decoration:none;font-weight:700">✗ Reject</a></div></div>`}).catch(console.error);
        }
        return ok(res,{success:true,type:'tutor'});
      }
      return err(res,'Invalid type');
    } catch(e) { console.error('[auth/register]',e.message); return err(res,'Registration failed: '+e.message,500); }
  }

  return err(res,'Unknown action');
}
