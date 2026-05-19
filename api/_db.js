// api/_db.js
process.env.HOME = '/tmp';

import { DuckDBInstance } from '@duckdb/node-api';
import crypto from 'crypto';

let _instance = null;
let _conn = null;
let _columns = {}; // cache column names per query

export async function getDB() {
  if (_conn) return _conn;
  const token = process.env.MOTHERDUCK_TOKEN;
  if (!token) throw new Error('MOTHERDUCK_TOKEN not set');
  const instance = await DuckDBInstance.create(
    `md:epiphany?motherduck_token=${token}&home_directory=/tmp`
  );
  _instance = instance;
  _conn = await instance.connect();
  return _conn;
}

export function sanitize(val) {
  return JSON.parse(JSON.stringify(val, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

export async function query(sql) {
  const db = await getDB();
  const reader = await db.runAndReadAll(sql);
  const columnNames = reader.columnNames();
  const rows = sanitize(reader.getRows());
  // Convert array rows to objects using column names
  return rows.map(row => {
    if (Array.isArray(row)) {
      const obj = {};
      columnNames.forEach((name, i) => { obj[name] = row[i]; });
      return obj;
    }
    return row;
  });
}

export function col(row, name) {
  if (!row) return undefined;
  if (row[name] !== undefined) return row[name];
  const lower = name.toLowerCase();
  if (row[lower] !== undefined) return row[lower];
  const key = Object.keys(row).find(k => k.toLowerCase() === lower);
  return key ? row[key] : undefined;
}

export function esc(val) {
  return String(val || '').replace(/'/g, "''");
}

export function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'epiphany_salt_2024').digest('hex');
}

export function ok(res, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}

export function err(res, message, status = 400) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(status).json({ error: message });
}

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
