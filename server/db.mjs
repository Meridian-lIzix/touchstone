// Arena 后端数据层：使用 Node 24 内置 node:sqlite，避免额外原生依赖
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
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
    ip_hash    TEXT,
    pair_key   TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_votes_ip ON votes(ip_hash, created_at);
  -- 一设备一对子一票（fp 为空时 SQLite 视 NULL 互不相等，靠 IP 限速兜底）
  CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_dedup ON votes(fp_hash, pair_key);
`);

// 对 IP 和设备指纹做短哈希，既能去重限速，也不直接落原始标识
export const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 32);

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
