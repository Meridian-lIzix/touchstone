// Arena 后端数据层：使用 Node 24 内置 node:sqlite，避免额外原生依赖
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// 数据库文件固定放在 server 目录下，便于本地启动脚本和备份文件一起管理
const here = dirname(fileURLToPath(import.meta.url));
export const db = new DatabaseSync(join(here, 'arena.db'));

// 首次启动时自动补齐表结构；数据模型说明见《Touchstone Arena 机制》
db.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    category  TEXT NOT NULL,
    text      TEXT NOT NULL,
    note      TEXT
  );
  CREATE TABLE IF NOT EXISTS works (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,
    prompt_id   INTEGER NOT NULL,
    model_label TEXT NOT NULL,           -- 对用户隐藏，翻牌前不下发
    media_url   TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    elo         REAL NOT NULL DEFAULT 1500,
    vote_count  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS votes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    category   TEXT NOT NULL,
    prompt_id  INTEGER,
    winner_id  INTEGER NOT NULL,
    loser_id   INTEGER NOT NULL,
    fp_hash    TEXT,
    sid_hash   TEXT,
    ip_hash    TEXT,
    ua_hash    TEXT,
    pair_key   TEXT,
    trust      INTEGER NOT NULL DEFAULT 100,
    counted    INTEGER NOT NULL DEFAULT 1,
    suspicious_reason TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pair_tokens (
    token_hash TEXT PRIMARY KEY,
    sid_hash   TEXT NOT NULL,
    fp_hash    TEXT,
    ip_hash    TEXT,
    ua_hash    TEXT,
    category   TEXT NOT NULL,
    prompt_id  INTEGER NOT NULL,
    work_a_id  INTEGER NOT NULL,
    work_b_id  INTEGER NOT NULL,
    pair_key   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_votes_ip ON votes(ip_hash, created_at);
  CREATE INDEX IF NOT EXISTS idx_pair_tokens_sid ON pair_tokens(sid_hash, created_at);
  CREATE INDEX IF NOT EXISTS idx_pair_tokens_expiry ON pair_tokens(expires_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_dedup ON votes(fp_hash, pair_key);
`);

// 增量迁移：为真实数据导入补充作品/题目字段，旧库自动补列
const addColumn = (table, name, ddl) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
};
addColumn('prompts', 'prompt_key', 'prompt_key TEXT');
addColumn('works', 'work_key', 'work_key TEXT');
addColumn('works', 'model_code', 'model_code TEXT');
addColumn('works', 'model_verification', 'model_verification TEXT');
addColumn('works', 'content_type', 'content_type TEXT');
addColumn('works', 'language', 'language TEXT');
addColumn('works', 'preview_text', 'preview_text TEXT');
addColumn('works', 'status', "status TEXT DEFAULT 'ok'");
addColumn('votes', 'sid_hash', 'sid_hash TEXT');
addColumn('votes', 'ua_hash', 'ua_hash TEXT');
addColumn('votes', 'trust', 'trust INTEGER NOT NULL DEFAULT 100');
addColumn('votes', 'counted', 'counted INTEGER NOT NULL DEFAULT 1');
addColumn('votes', 'suspicious_reason', 'suspicious_reason TEXT');
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_key ON prompts(category, prompt_key);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_works_key ON works(work_key);
  CREATE INDEX IF NOT EXISTS idx_votes_sid ON votes(sid_hash, created_at);
  CREATE INDEX IF NOT EXISTS idx_votes_fp ON votes(fp_hash, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_sid_dedup ON votes(sid_hash, pair_key);
`);

// 对 IP 和设备指纹做短哈希，既能去重限速，也不直接落原始标识
export const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

export function getArenaSecret() {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('arena_secret');
  if (row?.value) return row.value;
  const secret = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('arena_secret', secret);
  return secret;
}

// 子对 key 固定排序，保证 A-B 与 B-A 被视为同一个对子
export const pairKey = (a, b) => [Number(a), Number(b)].sort((x, y) => x - y).join('-');

// Elo 更新采用 K=32；只在新票通过校验后调用
const K = 32;
export function updateElo(winnerElo, loserElo) {
  const expWin = 1 / (1 + 10 ** ((loserElo - winnerElo) / 400));
  return {
    winner: winnerElo + K * (1 - expWin),
    loser: loserElo - K * (1 - expWin),
  };
}

// —— 管理后台专用 CRUD（admin/ 进程使用；公共 API index.mjs 不引用，访客行为不变）——
export const arenaAdmin = {
  listPrompts: () =>
    db
      .prepare(
        `SELECT p.*, (SELECT COUNT(*) FROM works w WHERE w.prompt_id = p.id) AS work_count
         FROM prompts p ORDER BY p.id DESC`,
      )
      .all(),
  getPrompt: (id) => db.prepare('SELECT * FROM prompts WHERE id = ?').get(id),
  insertPrompt: (category, text, note) =>
    db.prepare('INSERT INTO prompts (category, text, note) VALUES (?, ?, ?)').run(category, text, note),
  // 改品类时同步作品的冗余 category，保证配对/排行接口过滤一致
  updatePrompt(id, category, text, note) {
    db.prepare('UPDATE prompts SET category = ?, text = ?, note = ? WHERE id = ?').run(category, text, note, id);
    db.prepare('UPDATE works SET category = ? WHERE prompt_id = ?').run(category, id);
  },
  // 删 prompt 级联删掉名下作品与相关投票，避免残留孤儿数据
  deletePrompt(id) {
    db.exec('BEGIN');
    try {
      db.prepare(
        `DELETE FROM votes WHERE winner_id IN (SELECT id FROM works WHERE prompt_id = ?)
         OR loser_id IN (SELECT id FROM works WHERE prompt_id = ?)`,
      ).run(id, id);
      db.prepare('DELETE FROM works WHERE prompt_id = ?').run(id);
      db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
  listWorks: (promptId) => db.prepare('SELECT * FROM works WHERE prompt_id = ? ORDER BY id').all(promptId),
  getWork: (id) => db.prepare('SELECT * FROM works WHERE id = ?').get(id),
  insertWork: (promptId, category, modelLabel, mediaUrl) =>
    db
      .prepare('INSERT INTO works (category, prompt_id, model_label, media_url, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(category, promptId, modelLabel, mediaUrl, new Date().toISOString()),
  updateWork: (id, modelLabel, mediaUrl) =>
    db.prepare('UPDATE works SET model_label = ?, media_url = ? WHERE id = ?').run(modelLabel, mediaUrl, id),
  deleteWork(id) {
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM votes WHERE winner_id = ? OR loser_id = ?').run(id, id);
      db.prepare('DELETE FROM works WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
};
