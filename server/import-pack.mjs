// 数据包导入：读取 Touchstone数据导入包 的 prompts.csv / works.csv，
// 校验资源与重复项后复制资源到 server/media 并写入 arena.db。
// 幂等：prompts 按 (category, prompt_key) 复用，works 按 work_key 跳过已导入。
// 用法：node server/import-pack.mjs "<数据包目录>"
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { db } from './db.mjs';

const packDir = process.argv[2];
if (!packDir || !existsSync(packDir)) {
  console.error('用法：node server/import-pack.mjs "<数据包目录>"（需包含 prompts.csv / works.csv / assets）');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(here, 'media');

// 标准 CSV 解析：支持引号包裹、内嵌逗号/换行/双引号转义
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map((cells) => Object.fromEntries(header.map((key, idx) => [key, cells[idx] ?? ''])));
}

const prompts = parseCsv(readFileSync(join(packDir, 'prompts.csv'), 'utf8'));
const works = parseCsv(readFileSync(join(packDir, 'works.csv'), 'utf8'));
console.log(`[import] 读取 prompts ${prompts.length} 行，works ${works.length} 行`);

// —— 导入前校验：资源存在 + (category, prompt_key, model_code) 无重复 ——
const problems = [];
const seen = new Set();
for (const w of works) {
  const key = `${w.category}|${w.prompt_key}|${w.model_code}`;
  if (seen.has(key)) problems.push(`重复条目：${key}`);
  seen.add(key);
  if (!existsSync(join(packDir, w.file_path))) problems.push(`资源缺失：${w.work_key} → ${w.file_path}`);
}
for (const p of prompts) {
  if (!p.prompt_key || !p.category || !p.prompt_text) problems.push(`prompt 字段缺失：${JSON.stringify(p)}`);
}
if (problems.length > 0) {
  console.error(`[import] 校验失败 ${problems.length} 项，未写入任何数据：`);
  for (const msg of problems) console.error(`  - ${msg}`);
  process.exit(1);
}

// —— 清理种子占位数据：真实数据入库后示例 prompt 没有存在价值 ——
const placeholders = db.prepare("SELECT DISTINCT prompt_id FROM works WHERE media_url = 'placeholder'").all();
if (placeholders.length > 0) {
  db.exec('BEGIN');
  try {
    for (const { prompt_id } of placeholders) {
      db.prepare(
        `DELETE FROM votes WHERE winner_id IN (SELECT id FROM works WHERE prompt_id = ?)
         OR loser_id IN (SELECT id FROM works WHERE prompt_id = ?)`,
      ).run(prompt_id, prompt_id);
      db.prepare("DELETE FROM works WHERE prompt_id = ? AND media_url = 'placeholder'").run(prompt_id);
      const left = db.prepare('SELECT COUNT(*) AS n FROM works WHERE prompt_id = ?').get(prompt_id).n;
      if (left === 0) db.prepare('DELETE FROM prompts WHERE id = ?').run(prompt_id);
    }
    db.exec('COMMIT');
    console.log(`[import] 清理了 ${placeholders.length} 个种子占位 prompt 及其作品`);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// —— prompts：按 (category, prompt_key) 建立或复用 ——
const findPrompt = db.prepare('SELECT id FROM prompts WHERE category = ? AND prompt_key = ?');
const insPrompt = db.prepare('INSERT INTO prompts (category, prompt_key, text, note) VALUES (?, ?, ?, ?)');
const promptIds = new Map();
let promptsNew = 0;
for (const p of prompts) {
  const existing = findPrompt.get(p.category, p.prompt_key);
  let id = existing?.id;
  if (!id) {
    id = Number(insPrompt.run(p.category, p.prompt_key, p.prompt_text, p.note || null).lastInsertRowid);
    promptsNew += 1;
  }
  promptIds.set(`${p.category}|${p.prompt_key}`, id);
}
console.log(`[import] prompts：新建 ${promptsNew}，复用 ${prompts.length - promptsNew}`);

// —— works：复制资源到 server/media 并入库；work_key 已存在则跳过 ——
const findWork = db.prepare('SELECT id FROM works WHERE work_key = ?');
const insWork = db.prepare(
  `INSERT INTO works (work_key, category, prompt_id, model_label, model_code, model_verification,
                      content_type, language, media_url, preview_text, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const now = new Date().toISOString();
let inserted = 0;
let skipped = 0;
let failedKept = 0;
for (const w of works) {
  if (findWork.get(w.work_key)) { skipped += 1; continue; }
  const promptId = promptIds.get(`${w.category}|${w.prompt_key}`);
  if (!promptId) throw new Error(`作品 ${w.work_key} 找不到对应 prompt：${w.category}/${w.prompt_key}`);

  const srcPath = join(packDir, w.file_path);
  const destDir = join(MEDIA_DIR, w.category);
  mkdirSync(destDir, { recursive: true });
  const fileName = basename(w.file_path);
  copyFileSync(srcPath, join(destDir, fileName));
  const mediaUrl = `/media/${w.category}/${fileName}`;

  // 卡片预览文本：CSV 给的优先；code/text 缺省时取文件开头一段
  let preview = w.preview_text || '';
  if (!preview && (w.content_type === 'code' || w.content_type === 'text')) {
    preview = readFileSync(srcPath, 'utf8').replace(/^﻿/, '').trim().slice(0, 400);
  }

  insWork.run(
    w.work_key, w.category, promptId, w.model_label, w.model_code,
    w.model_verification || null, w.content_type, w.language || null,
    mediaUrl, preview || null, w.status || 'ok', now,
  );
  inserted += 1;
  if (w.status === 'failed') failedKept += 1;
}

const totals = db.prepare("SELECT COALESCE(status,'ok') AS s, COUNT(*) AS n FROM works GROUP BY s").all();
console.log(`[import] works：新入库 ${inserted}（其中 failed 标注 ${failedKept}），跳过已存在 ${skipped}`);
console.log(`[import] 当前库内作品：${totals.map((t) => `${t.s}=${t.n}`).join('，')}`);
console.log('[import] 完成。failed 样本已保留并标注，不参与盲评配对与排行榜');
