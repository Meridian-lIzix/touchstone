// 管理后台数据层：独立 admin.db，不与 Arena 高频写入的 arena.db 混用
// 密码用 Node 内置 crypto.scrypt（零原生依赖，同 node:sqlite 的选型理由）
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const adminDb = new DatabaseSync(join(here, 'admin.db'));

adminDb.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 会话版本号：登出时递增，使已签发的 Cookie 立即失效
{
  const cols = adminDb.prepare('PRAGMA table_info(admin_users)').all().map((r) => r.name);
  if (!cols.includes('token_version')) {
    adminDb.exec('ALTER TABLE admin_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
  }
}

export function bumpTokenVersion(username) {
  adminDb.prepare('UPDATE admin_users SET token_version = token_version + 1 WHERE username = ?').run(username);
}

// 存储格式 salt:hash，两段都是 hex；校验走 timingSafeEqual 防时序侧信道
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// Cookie 签名密钥持久化在 meta 表：重启后已登录会话不失效
export function getCookieSecret() {
  const row = adminDb.prepare('SELECT value FROM meta WHERE key = ?').get('cookie_secret');
  if (row) return row.value;
  const secret = randomBytes(32).toString('hex');
  adminDb.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('cookie_secret', secret);
  return secret;
}

// 首次启动自动建唯一管理员；密码取 ADMIN_PASSWORD 环境变量，否则随机生成并打印一次
export function ensureAdminUser() {
  const { n } = adminDb.prepare('SELECT COUNT(*) AS n FROM admin_users').get();
  if (n > 0) return null;
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  adminDb
    .prepare('INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run('admin', hashPassword(password), new Date().toISOString());
  return password;
}

export const findUser = (username) =>
  adminDb.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);

export function setPassword(username, password) {
  const { changes } = adminDb
    .prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?')
    .run(hashPassword(password), username);
  return changes > 0;
}
