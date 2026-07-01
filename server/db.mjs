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
