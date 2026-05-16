// api/subscription.js
import { query, esc, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return err(res, 'Method not allowed', 405);

  const { action, tutorId } = req.body || {};
  if (!action || !tutorId) return err(res, 'action and tutorId required');

  try {
    if (action === 'start_trial') {
      const now = new Date();
      const trialEnd = new Date(now); trialEnd.setDate(trialEnd.getDate() + 30);
      const existing = await query(`SELECT id FROM epiphany.main.subscriptions WHERE tutor_id = '${esc(tutorId)}'`);
      if (existing.length > 0) {
        await query(`UPDATE epiphany.main.subscriptions SET status='trial',trial_start='${now.toISOString()}',trial_end='${trialEnd.toISOString()}',next_billing='${trialEnd.toISOString()}',updated_at=NOW() WHERE tutor_id='${esc(tutorId)}'`);
      } else {
        await query(`INSERT INTO epiphany.main.subscriptions (tutor_id,status,trial_start,trial_end,next_billing,amount) VALUES ('${esc(tutorId)}','trial','${now.toISOString()}','${trialEnd.toISOString()}','${trialEnd.toISOString()}',250.00)`);
      }
      return ok(res, { success: true, subscription: { status:'trial', trialStart:now.toISOString(), trialEnd:trialEnd.toISOString() } });
    }

    if (action === 'cancel') {
      await query(`UPDATE epiphany.main.subscriptions SET status='cancelled',updated_at=NOW() WHERE tutor_id='${esc(tutorId)}'`);
      return ok(res, { success: true, status: 'cancelled' });
    }

    return err(res, 'Unknown action');
  } catch(e) { return err(res, 'Subscription update failed', 500); }
}
