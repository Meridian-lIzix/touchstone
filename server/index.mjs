// Arena 盲评后端：只处理匿名对子、投票、Elo 算分、翻牌和排行榜
// 合规边界：站内不生成内容，所有作品由站长离线生成后再入库
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { serve } from '@hono/node-server';
import { readFileSync, existsSync } from 'node:fs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { build } from 'esbuild';
import { db, sha, pairKey, updateElo, getArenaSecret } from './db.mjs';

// CORS 默认放开供本地联调；上线用 ARENA_ALLOWED_ORIGIN=https://域名（逗号分隔多个）收紧
const allowedOrigins = process.env.ARENA_ALLOWED_ORIGIN
  ? process.env.ARENA_ALLOWED_ORIGIN.split(',').map((s) => s.trim())
  : ['http://localhost:4321', 'http://127.0.0.1:4321'];
const app = new Hono();
app.use('/api/*', cors({
  origin: (origin) => (allowedOrigins.includes('*') || allowedOrigins.includes(origin) ? origin : null),
  credentials: true,
}));

const SECRET = getArenaSecret();
const SESSION_COOKIE = 'arena_sid';
const SESSION_MAX_AGE = 90 * 24 * 60 * 60;
const PAIR_TOKEN_TTL_MS = 5 * 60 * 1000;
const TRUST_THRESHOLD = 60;

const clientIp = (c) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
const userAgent = (c) => c.req.header('user-agent') || 'unknown';
const cleanFp = (fp) => (fp && fp !== 'anon' ? String(fp) : null);
const nowIso = () => new Date().toISOString();
const fromNowIso = (ms) => new Date(Date.now() + ms).toISOString();

async function arenaIdentity(c, create = true) {
  let sid = await getSignedCookie(c, SECRET, SESSION_COOKIE);
  if (!sid && create) {
    sid = randomUUID();
    await setSignedCookie(c, SESSION_COOKIE, sid, SECRET, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
      secure: process.env.ARENA_COOKIE_SECURE === '1',
    });
  }
  if (!sid) return null;
  const ip = clientIp(c);
  const ua = userAgent(c);
  return {
    sid,
    sidHash: sha(sid),
    ipHash: sha(ip),
    uaHash: sha(ua),
  };
}

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(body).digest('base64url');
  const actualBuffer = Buffer.from(sig);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function issuePairToken({ identity, fpHash, category, promptId, workIds, pk }) {
  const createdAt = nowIso();
  const expiresAt = fromNowIso(PAIR_TOKEN_TTL_MS);
  const token = signPayload({ v: 1, n: randomUUID(), exp: Date.now() + PAIR_TOKEN_TTL_MS });
  db.prepare(
    `INSERT INTO pair_tokens
     (token_hash, sid_hash, fp_hash, ip_hash, ua_hash, category, prompt_id, work_a_id, work_b_id, pair_key, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(sha(token), identity.sidHash, fpHash, identity.ipHash, identity.uaHash, category, promptId, workIds[0], workIds[1], pk, createdAt, expiresAt);
  return token;
}

const countRecent = (field, value, since) => {
  if (!value) return 0;
  return db.prepare(`SELECT COUNT(*) AS n FROM votes WHERE ${field} = ? AND created_at > ?`).get(value, since).n;
};

function trustForVote({ tokenRow, fpHash, sidRecent, fpRecent, uaRecent }) {
  const reasons = [];
  let trust = 100;
  const age = Date.now() - Date.parse(tokenRow.created_at);
  if (age < 800) {
    trust = Math.min(trust, 40);
    reasons.push('too_fast');
  }
  if (!fpHash) {
    trust = Math.min(trust, 50);
    reasons.push('missing_fp');
  }
  if (sidRecent >= 30 || fpRecent >= 30) {
    trust = Math.min(trust, 70);
    reasons.push('high_session_velocity');
  }
  if (uaRecent >= 80) {
    trust = Math.min(trust, 50);
    reasons.push('high_ua_velocity');
  }
  return { trust, counted: trust >= TRUST_THRESHOLD ? 1 : 0, reason: reasons.join(',') || null };
}

// 导入的作品资源由本进程只读托管（server/media，不进 git）
const here = dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = join(here, 'media');
const MEDIA_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
app.get('/media/*', (c) => {
  const rel = decodeURIComponent(c.req.path.slice('/media/'.length));
  const path = normalize(join(MEDIA_DIR, rel));
  if (!path.startsWith(MEDIA_DIR) || !existsSync(path)) return c.notFound();
  const type = MEDIA_TYPES[extname(path).toLowerCase()];
  if (!type) return c.notFound();
  return c.body(readFileSync(path), 200, {
    'content-type': type,
    'cache-control': 'no-store, max-age=0',
    'access-control-allow-origin': '*',
  });
});

// 复用常用查询和翻牌返回格式，避免每个接口重复写模型揭示逻辑
const getWork = db.prepare('SELECT * FROM works WHERE id = ?');
const reveal = (...works) =>
  Object.fromEntries(works.map((w) => [w.id, { model: w.model_label }]));
const visualCodePrefixes = ['P01', 'P03', 'P06', 'P08', 'P10', 'P13', 'P15', 'P19'];
const visualCodeSql = visualCodePrefixes.map((key) => `w.media_url LIKE '/media/code/${key}-%'`).join(' OR ');
const codePreviewCache = new Map();
const modelLeakLine = /^(?:(?:\u817e\u8baf\u6df7\u5143|\u6587\u5fc3\u4e00\u8a00|\u667a\u8c31\u6e05\u8a00)(?:[-_\s]*(?:[A-Za-z0-9.]+))*|(?:deepseek|doubao|qwen|kimi|glm|hunyuan|ernie)(?:[-_\s]*(?:[A-Za-z0-9.]+))+)\s*$/i;
const reactPreviewStyle = `
html,body{margin:0;min-height:100%;background:#fff;color:#172033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
body{padding:24px}
.ts-preview-stage{min-height:calc(100vh - 48px);display:grid;place-items:center;background:#fff}
.ts-react-panel{width:min(560px,100%);padding:24px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;box-shadow:0 18px 45px rgba(15,23,42,.1)}
.relative{position:relative}.absolute{position:absolute}.inline-block{display:inline-block}.flex{display:flex}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:.5rem}.w-64{width:16rem}.w-full{width:100%}.mt-1{margin-top:.25rem}.px-3{padding-left:.75rem;padding-right:.75rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.border{border:1px solid #d1d5db}.rounded{border-radius:.5rem}.shadow{box-shadow:0 10px 25px rgba(15,23,42,.12)}.bg-white{background:#fff}.bg-gray-100{background:#f3f4f6}.bg-blue-50{background:#eff6ff}.bg-blue-100{background:#dbeafe}.bg-blue-600{background:#2563eb}.text-white{color:#fff}.text-gray-400{color:#9ca3af}.cursor-pointer{cursor:pointer}.select-none{user-select:none}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.z-10{z-index:10}.max-h-60{max-height:15rem}.overflow-auto{overflow:auto}.focus\\:outline-none:focus{outline:none}.hover\\:bg-blue-50:hover{background:#eff6ff}
button,input{font:inherit}
button{cursor:pointer}
ul{margin:0;padding:0}
`;

function stripCodeEnvelopeForPreview(source) {
  return String(source || '')
    .split(/\r?\n/)
    .filter((line) => !modelLeakLine.test(line.trim()))
    .join('\n')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```[\w-]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
    .replace(/^(html|css|javascript|js|typescript|ts|tsx|jsx)\s*\n/i, '')
    .trim();
}

function codeMediaPath(work) {
  if (!work?.media_url?.startsWith('/media/')) return null;
  const rel = decodeURIComponent(work.media_url.slice('/media/'.length));
  const path = normalize(join(MEDIA_DIR, rel));
  if (!path.startsWith(MEDIA_DIR) || !existsSync(path)) return null;
  return path;
}

function inferReactComponentName(source) {
  const known = ['MultiSelectDropdown', 'MultiSelect', 'SearchBox', 'TagFilter', 'ToastProvider', 'Toast', 'Pagination', 'Paginator'];
  const knownName = known.find((name) => new RegExp(`\\b${name}\\b`).test(source));
  if (knownName) return knownName;
  return source.match(/\b(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)\b/)?.[1] || null;
}

function prepareReactSource(source) {
  let componentName = null;
  let prepared = source
    .replace(/export\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g, (_, name) => {
      componentName = componentName || name;
      return `function ${name}(`;
    })
    .replace(/export\s+default\s+class\s+([A-Z][A-Za-z0-9_]*)\s+/g, (_, name) => {
      componentName = componentName || name;
      return `class ${name} `;
    })
    .replace(/export\s+(function|class)\s+([A-Z][A-Za-z0-9_]*)/g, (_, kind, name) => {
      componentName = componentName || name;
      return `${kind} ${name}`;
    })
    .replace(/export\s+(const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g, (_, kind, name) => {
      componentName = componentName || name;
      return `${kind} ${name}`;
    })
    .replace(/export\s+default\s+([^;\n]+);?/g, (_, expr) => {
      componentName = '__TouchstoneDefault';
      return `const __TouchstoneDefault = ${expr}; const __TouchstoneComponent = __TouchstoneDefault;`;
    })
    .replace(/export\s+\{[^}]+\};?/g, '');
  if (!/\b__TouchstoneComponent\b/.test(prepared)) {
    componentName = componentName || inferReactComponentName(prepared);
    if (!componentName) return null;
    prepared += `\nconst __TouchstoneComponent = ${componentName};\n`;
  }
  return prepared;
}

function reactFixtureKind(source) {
  if (/SearchBox|onSearch|noResult/i.test(source)) return 'search';
  if (/MultiSelect/i.test(source)) return 'multi';
  if (/TagFilter|selectedTags|onFilterChange/i.test(source)) return 'tags';
  if (/Toast|ToastProvider|useToast/i.test(source)) return 'toast';
  if (/Pagination|Paginator|currentPage|totalPages/i.test(source)) return 'pages';
  return 'component';
}

function reactHarness(source) {
  const usesObjectOptions = /\.(?:value|label)\b/.test(source) || /\bOption\b/.test(source);
  const options = usesObjectOptions
    ? [{ label: 'Design', value: 'design' }, { label: 'Writing', value: 'writing' }, { label: 'Research', value: 'research' }, { label: 'Analysis', value: 'analysis' }]
    : ['Design', 'Writing', 'Research', 'Analysis'];
  const selected = usesObjectOptions ? ['design', 'writing'] : ['Design', 'Writing'];
  return `
const __fixtureKind = ${JSON.stringify(reactFixtureKind(source))};
const __fixtureOptions = ${JSON.stringify(options)};
const __fixtureSelected = ${JSON.stringify(selected)};
function __TouchstoneHarness(){
  const [selected,setSelected]=__React.useState(__fixtureSelected);
  const [value,setValue]=__React.useState(__fixtureSelected);
  const [page,setPage]=__React.useState(4);
  const updateSelection=(next)=>{const safe=Array.isArray(next)?next:[];setSelected(safe);setValue(safe);};
  const props={
    options:__fixtureOptions,
    selected,
    value,
    onChange:updateSelection,
    placeholder:'Select tools...',
    label:'Selected tools',
    tags:['Design','Writing','Research','Analysis'],
    selectedTags:selected,
    onFilterChange:updateSelection,
    query:'image editor',
    onSearch:()=>{},
    results:['Image editor suite','Batch resize workflow'],
    message:'Saved successfully',
    type:'success',
    duration:999999,
    currentPage:page,
    totalPages:12,
    onPageChange:setPage
  };
  return __React.createElement('section',{className:'ts-react-panel','data-kind':__fixtureKind},__React.createElement(__TouchstoneComponent,props));
}
__createRoot(document.getElementById('root')).render(__React.createElement(__TouchstoneHarness));
setTimeout(()=>{const el=document.querySelector('[role="combobox"],button,[tabindex="0"],input');if(el&&el.dispatchEvent){el.focus?.();el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));}},120);
`;
}

async function reactPreviewDoc(source) {
  const code = stripCodeEnvelopeForPreview(source);
  if (!/React|useState|useEffect|useRef|useCallback|return\s*\(|<[A-Z_a-z][\s\S]*>/.test(code)) return null;
  const prepared = prepareReactSource(code);
  if (!prepared) return null;
  const entry = `import * as __React from 'react';\nimport { createRoot as __createRoot } from 'react-dom/client';\n${prepared}\n${reactHarness(code)}`;
  const result = await build({
    stdin: { contents: entry, loader: 'tsx', resolveDir: dirname(here), sourcefile: 'touchstone-preview.tsx' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    logLevel: 'silent',
    absWorkingDir: dirname(here),
  });
  const script = result.outputFiles[0]?.text;
  if (!script) return null;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${reactPreviewStyle}</style></head><body data-touchstone-react-preview="1"><main class="ts-preview-stage"><div id="root"></div></main><script>${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
}

app.get('/api/code-preview/:id', async (c) => {
  const work = getWork.get(Number(c.req.param('id')));
  if (!work || work.category !== 'code' || (work.status && work.status !== 'ok')) return c.json({ error: 'not_found' }, 404);
  const path = codeMediaPath(work);
  if (!path) return c.json({ error: 'not_found' }, 404);
  const cacheKey = `${work.id}:${work.media_url}`;
  const cached = codePreviewCache.get(cacheKey);
  if (cached) return c.json({ doc: cached });
  try {
    const doc = await reactPreviewDoc(readFileSync(path, 'utf8'));
    if (!doc) return c.json({ error: 'not_renderable' }, 422);
    codePreviewCache.set(cacheKey, doc);
    return c.json({ doc });
  } catch {
    return c.json({ error: 'not_renderable' }, 422);
  }
});

// 向前端提供可切换品类，来源以数据库已有可配对作品为准
app.get('/api/categories', (c) =>
  c.json({
    categories: db
      .prepare("SELECT DISTINCT category FROM works WHERE COALESCE(status, 'ok') = 'ok' ORDER BY category")
      .all()
      .map((r) => r.category),
  }),
);

// 随机挑一个至少有两件可用作品的 prompt，再随机返回两件匿名作品
app.get('/api/arena/pair', async (c) => {
  const identity = await arenaIdentity(c);
  const category = c.req.query('category') || 'image';
  const visualOnly = category === 'code' && c.req.query('visualOnly') === '1';
  const visualFilter = visualOnly ? `AND (${visualCodeSql})` : '';
  const fpHash = cleanFp(c.req.query('fp')) ? sha(c.req.query('fp')) : null;
  db.prepare("DELETE FROM pair_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)").run(nowIso(), new Date(Date.now() - 60 * 60 * 1000).toISOString());

  for (let attempt = 0; attempt < 32; attempt++) {
    const prompt = db
      .prepare(
        `SELECT p.* FROM prompts p
         WHERE p.category = ?
           AND (SELECT COUNT(*) FROM works w WHERE w.prompt_id = p.id AND COALESCE(w.status, 'ok') = 'ok' ${visualFilter}) >= 2
         ORDER BY RANDOM() LIMIT 1`,
      )
      .get(category);
    if (!prompt) return c.json({ error: 'no_prompts' }, 404);

    const works = db
      .prepare(
        `SELECT id, media_url, COALESCE(content_type, category) AS content_type, language, preview_text
         FROM works w WHERE prompt_id = ? AND COALESCE(status, 'ok') = 'ok' ${visualFilter} ORDER BY RANDOM() LIMIT 2`,
      )
      .all(prompt.id);
    if (works.length < 2) continue;

    const pk = pairKey(works[0].id, works[1].id);
    const seen = db
      .prepare(
        `SELECT 1 FROM votes
         WHERE pair_key = ?
           AND ((sid_hash IS NOT NULL AND sid_hash = ?) OR (fp_hash IS NOT NULL AND fp_hash = ?))
         LIMIT 1`,
      )
      .get(pk, identity.sidHash, fpHash);
    if (seen) continue;

    const pairToken = issuePairToken({
      identity,
      fpHash,
      category,
      promptId: prompt.id,
      workIds: works.map((w) => w.id).sort((a, b) => a - b),
      pk,
    });
    return c.json({
      promptId: prompt.id,
      category,
      prompt: prompt.text,
      pairToken,
      works: works.map((w) => ({
        id: w.id,
        mediaUrl: w.media_url,
        contentType: w.content_type,
        language: w.language || null,
        previewText: w.preview_text || null,
      })),
    });
  }

  return c.json({ error: 'no_unseen_pairs' }, 404);
});

// 接收一次盲选结果，校验对子有效后写入投票并更新 Elo
app.post('/api/vote', async (c) => {
  const identity = await arenaIdentity(c, false);
  if (!identity) return c.json({ error: 'missing_session' }, 401);
  const { winnerId, loserId, fp, pairToken } = await c.req.json().catch(() => ({}));
  if (!winnerId || !loserId || winnerId === loserId) return c.json({ error: 'bad_request' }, 400);
  const tokenPayload = verifyPayload(pairToken);
  if (!tokenPayload) return c.json({ error: 'invalid_pair_token' }, 400);

  const a = getWork.get(winnerId);
  const b = getWork.get(loserId);
  if (!a || !b || a.prompt_id !== b.prompt_id) return c.json({ error: 'invalid_pair' }, 400);

  const fpHash = cleanFp(fp) ? sha(fp) : null;
  const pk = pairKey(winnerId, loserId);
  const tokenHash = sha(pairToken);
  const tokenRow = db.prepare('SELECT * FROM pair_tokens WHERE token_hash = ?').get(tokenHash);
  if (!tokenRow || tokenRow.sid_hash !== identity.sidHash || tokenRow.pair_key !== pk || tokenRow.prompt_id !== a.prompt_id) {
    return c.json({ error: 'invalid_pair_token' }, 400);
  }
  if (tokenRow.fp_hash && tokenRow.fp_hash !== fpHash) return c.json({ error: 'invalid_fingerprint' }, 400);

  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const ipRecent = countRecent('ip_hash', identity.ipHash, tenMinAgo);
  const sidRecent = countRecent('sid_hash', identity.sidHash, tenMinAgo);
  const fpRecent = countRecent('fp_hash', fpHash, tenMinAgo);
  const uaRecent = countRecent('ua_hash', identity.uaHash, tenMinAgo);
  if (ipRecent >= 60 || sidRecent >= 45 || fpRecent >= 45) return c.json({ error: 'rate_limited' }, 429);
  const voteTrust = trustForVote({ tokenRow, fpHash, sidRecent, fpRecent, uaRecent });
  const counted = voteTrust.counted;
  const createdAt = nowIso();

  const claimed = db
    .prepare('UPDATE pair_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .run(createdAt, tokenHash, createdAt);
  if (claimed.changes !== 1) return c.json({ error: 'pair_token_used' }, 409);

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO votes
       (category, prompt_id, winner_id, loser_id, fp_hash, sid_hash, ip_hash, ua_hash, pair_key, trust, counted, suspicious_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(a.category, a.prompt_id, a.id, b.id, fpHash, identity.sidHash, identity.ipHash, identity.uaHash, pk, voteTrust.trust, counted, voteTrust.reason, createdAt);
    if (counted) {
      const { winner, loser } = updateElo(a.elo, b.elo);
      db.prepare('UPDATE works SET elo = ?, vote_count = vote_count + 1 WHERE id = ?').run(winner, a.id);
      db.prepare('UPDATE works SET elo = ?, vote_count = vote_count + 1 WHERE id = ?').run(loser, b.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE')) {
      return c.json({ ok: true, deduped: true, counted: false, revealed: reveal(a, b) });
    }
    throw err;
  }

  return c.json({ ok: true, counted: Boolean(counted), trust: voteTrust.trust, revealed: reveal(a, b) });
});

// 排行榜按 model_code 聚合（同一模型不同批次标签可合并），展示用 model_label
app.get('/api/leaderboard', (c) => {
  const category = c.req.query('category') || 'image';
  const rows = db
    .prepare(
      `SELECT COALESCE(w.model_code, w.model_label) AS code,
              MAX(w.model_label) AS model,
              MAX(COALESCE(w.model_verification, 'official')) AS verification,
              AVG(w.elo) AS elo, SUM(w.vote_count) AS votes, COUNT(*) AS works,
              (SELECT w2.media_url
               FROM works w2
               WHERE w2.category = w.category
                 AND COALESCE(w2.status, 'ok') = 'ok'
                 AND COALESCE(w2.model_code, w2.model_label) = COALESCE(w.model_code, w.model_label)
                 AND COALESCE(w2.content_type, w2.category) = 'image'
                 AND w2.media_url != 'placeholder'
               ORDER BY w2.vote_count DESC, w2.elo DESC, w2.id DESC
               LIMIT 1) AS cover_url
       FROM works w WHERE w.category = ? AND COALESCE(w.status, 'ok') = 'ok'
       GROUP BY COALESCE(w.model_code, w.model_label) ORDER BY elo DESC, votes DESC, model ASC`,
    )
    .all(category);
  return c.json({
    category,
    models: rows.map((r, i) => ({
      rank: i + 1,
      model: r.model,
      verification: r.verification,
      elo: Math.round(r.elo),
      votes: r.votes ?? 0,
      works: r.works,
      coverUrl: r.cover_url || null,
    })),
  });
});

// 启动 Node HTTP 服务；PORT/HOST 可由环境变量覆盖，默认给前端本地联调使用
const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port, ...(process.env.HOST ? { hostname: process.env.HOST } : {}) });
console.log(`[arena] API 已启动：http://localhost:${port}`);
