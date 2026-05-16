// api/test.js
import { query, ok, err, cors } from './_db.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const rows = await query("SELECT COUNT(*) as count FROM epiphany.main.users");
    return ok(res, { success: true, message: 'DB connected!', userCount: rows[0]?.[0]?.toString()||'0' });
  } catch(e) {
    return err(res, e.message, 500);
  }
}
