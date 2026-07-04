// Touchstone 管理后台：独立于主站与公共 API 的第三个进程（默认 :8788）
// 职责：单管理员登录、四类 Markdown 内容 CRUD（写文件 + git commit）、
// Arena prompts/works CRUD（复用 server/db.mjs）、本地媒体上传、串行化站点构建
import { Hono } from 'hono';
import { html } from 'hono/html';
import { serve } from '@hono/node-server';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { PORT } from './config.mjs';
import { adminDb, verifyPassword, getCookieSecret, ensureAdminUser, findUser } from './db.mjs';
import { db, arenaAdmin } from '../server/db.mjs';
import { COLLECTIONS } from './schemas.mjs';
import { listEntries, readEntry, saveEntry, deleteEntry, assertSlug, HttpError, REPO_ROOT } from './content.mjs';
import { startBuild, buildStatus } from './build.mjs';
import { storage, UPLOAD_DIR } from './storage.mjs';
import { layout, loginPage } from './views/layout.mjs';
import { dashboardPage } from './views/dashboard.mjs';
import { listPage, FORM_VIEWS } from './views/content.mjs';
import { arenaPage, promptDetailPage } from './views/arena.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SECRET = getCookieSecret();
const COOKIE = 'ts_admin';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const app = new Hono();

// —— 静态资源：显式白名单，不做通配目录服务 ——
// tokens.css 直接引用主站真源文件，后台配色/字体与主站永远同步
const ASSETS = {
  'tokens.css': { path: join(REPO_ROOT, 'src/styles/tokens.css'), type: 'text/css' },
  'admin.css': { path: join(here, 'public/admin.css'), type: 'text/css' },
  'admin.js': { path: join(here, 'public/admin.js'), type: 'text/javascript' },
  'favicon.svg': { path: join(REPO_ROOT, 'public/favicon.svg'), type: 'image/svg+xml' },
};
const FONTS = {
  'source-serif-4-latin-wght-normal.woff2': '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2',
  'inter-latin-wght-normal.woff2': '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  'hanken-grotesk-latin-wght-normal.woff2': '@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2',
  'geist-mono-latin-400-normal.woff2': '@fontsource/geist-mono/files/geist-mono-latin-400-normal.woff2',
};
const MEDIA_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.txt': 'text/plain', '.md': 'text/markdown',
};

app.get('/assets/fonts/:name', (c) => {
  const rel = FONTS[c.req.param('name')];
  if (!rel) return c.notFound();
  return c.body(readFileSync(join(REPO_ROOT, 'node_modules', rel)), 200, {
    'content-type': 'font/woff2',
    'cache-control': 'public, max-age=604800',
  });
});
app.get('/assets/:name', (c) => {
  const asset = ASSETS[c.req.param('name')];
  if (!asset || !existsSync(asset.path)) return c.notFound();
  return c.body(readFileSync(asset.path), 200, { 'content-type': asset.type });
});

// 上传目录公开只读：Arena 前端 island 需要直接引用这些媒体 URL
app.get('/uploads/:name', (c) => {
  const name = basename(c.req.param('name'));
  const path = join(UPLOAD_DIR, name);
  if (!existsSync(path)) return c.notFound();
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return c.body(readFileSync(path), 200, {
    'content-type': MEDIA_TYPES[ext] ?? 'application/octet-stream',
    'cache-control': 'public, max-age=86400',
  });
});

// —— 登录 / 会话 ——
// 登录失败限速：同 IP 10 分钟最多 10 次
const loginFails = new Map();
const clientIp = (c) =>
  c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';

app.get('/login', (c) => c.html(loginPage()));

app.post('/api/login', async (c) => {
  const ip = clientIp(c);
  const rec = loginFails.get(ip);
  if (rec && rec.count >= 10 && Date.now() - rec.ts < 10 * 60 * 1000) {
    return c.json({ error: '尝试过于频繁，请 10 分钟后再试' }, 429);
  }
  const { username, password } = await c.req.json().catch(() => ({}));
  const user = username && password ? findUser(username) : null;
  if (!user || !verifyPassword(password, user.password_hash)) {
    loginFails.set(ip, { count: (rec?.count ?? 0) + 1, ts: Date.now() });
    return c.json({ error: '用户名或密码不对' }, 401);
  }
  loginFails.delete(ip);
  await setSignedCookie(c, COOKIE, `${user.username}:${Date.now() + SESSION_MS}`, SECRET, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: SESSION_MS / 1000,
  });
  return c.json({ ok: true });
});

app.post('/api/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

// 除登录与静态资源外全部要求会话；页面重定向、API 返回 401
app.use('*', async (c, next) => {
  const value = await getSignedCookie(c, SECRET, COOKIE);
  const [, expiry] = String(value || '').split(':');
  const valid = value && Number(expiry) > Date.now();
  if (!valid) {
    if (c.req.path.startsWith('/api/')) return c.json({ error: '未登录' }, 401);
    return c.redirect('/login');
  }
  await next();
});

// —— 页面 ——
app.get('/', (c) => {
  const contentCounts = Object.fromEntries(
    Object.keys(COLLECTIONS).map((key) => {
      const entries = listEntries(key);
      return [key, { total: entries.length, drafts: entries.filter((e) => e.draft).length }];
    }),
  );
  const arenaCounts = {
    prompts: db.prepare('SELECT COUNT(*) AS n FROM prompts').get().n,
    works: db.prepare('SELECT COUNT(*) AS n FROM works').get().n,
    votes: db.prepare('SELECT COUNT(*) AS n FROM votes').get().n,
  };
  return c.html(dashboardPage({ contentCounts, arenaCounts, build: buildStatus() }));
});

const withCollection = (c) => {
  const collection = c.req.param('collection');
  if (!COLLECTIONS[collection]) throw new HttpError(404, `未知集合：${collection}`);
  return collection;
};

app.get('/content/:collection', (c) => {
  const collection = withCollection(c);
  return c.html(listPage(collection, listEntries(collection)));
});
app.get('/content/:collection/new', (c) => {
  const collection = withCollection(c);
  return c.html(FORM_VIEWS[collection](null, true));
});
app.get('/content/:collection/:slug/edit', (c) => {
  const collection = withCollection(c);
  const entry = readEntry(collection, assertSlug(c.req.param('slug')));
  return c.html(FORM_VIEWS[collection](entry, false));
});

app.get('/arena', (c) => c.html(arenaPage(arenaAdmin.listPrompts())));
app.get('/arena/prompts/:id', (c) => {
  const prompt = arenaAdmin.getPrompt(c.req.param('id'));
  if (!prompt) throw new HttpError(404, 'prompt 不存在');
  return c.html(promptDetailPage(prompt, arenaAdmin.listWorks(prompt.id)));
});

// —— 内容 API ——
app.get('/api/content/:collection', (c) => c.json({ entries: listEntries(withCollection(c)) }));
app.get('/api/content/:collection/:slug', (c) =>
  c.json(readEntry(withCollection(c), assertSlug(c.req.param('slug')))),
);
app.post('/api/content/:collection', async (c) => {
  const collection = withCollection(c);
  const { slug, data, body } = await c.req.json().catch(() => ({}));
  if (!slug || !data) throw new HttpError(400, '缺少 slug 或 data');
  return c.json(saveEntry(collection, assertSlug(slug), data, body, { isNew: true }), 201);
});
app.put('/api/content/:collection/:slug', async (c) => {
  const collection = withCollection(c);
  const { data, body } = await c.req.json().catch(() => ({}));
  if (!data) throw new HttpError(400, '缺少 data');
  return c.json(saveEntry(collection, assertSlug(c.req.param('slug')), data, body));
});
app.delete('/api/content/:collection/:slug', (c) => {
  deleteEntry(withCollection(c), assertSlug(c.req.param('slug')));
  return c.json({ ok: true });
});

// —— Arena API ——
const requireFields = (obj, keys) => {
  for (const key of keys) {
    if (!obj?.[key] || !String(obj[key]).trim()) throw new HttpError(400, `缺少字段：${key}`);
  }
};

app.post('/api/arena/prompts', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['category', 'text']);
  const { lastInsertRowid } = arenaAdmin.insertPrompt(
    body.category.trim(),
    body.text.trim(),
    body.note?.trim() || null,
  );
  return c.json({ id: Number(lastInsertRowid) }, 201);
});
app.put('/api/arena/prompts/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!arenaAdmin.getPrompt(id)) throw new HttpError(404, 'prompt 不存在');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['category', 'text']);
  arenaAdmin.updatePrompt(id, body.category.trim(), body.text.trim(), body.note?.trim() || null);
  return c.json({ ok: true });
});
app.delete('/api/arena/prompts/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!arenaAdmin.getPrompt(id)) throw new HttpError(404, 'prompt 不存在');
  arenaAdmin.deletePrompt(id);
  return c.json({ ok: true });
});

app.post('/api/arena/works', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['promptId', 'modelLabel', 'mediaUrl']);
  const prompt = arenaAdmin.getPrompt(Number(body.promptId));
  if (!prompt) throw new HttpError(404, 'prompt 不存在');
  const { lastInsertRowid } = arenaAdmin.insertWork(
    prompt.id,
    prompt.category,
    body.modelLabel.trim(),
    body.mediaUrl.trim(),
  );
  return c.json({ id: Number(lastInsertRowid) }, 201);
});
app.put('/api/arena/works/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!arenaAdmin.getWork(id)) throw new HttpError(404, '作品不存在');
  const body = await c.req.json().catch(() => ({}));
  requireFields(body, ['modelLabel', 'mediaUrl']);
  arenaAdmin.updateWork(id, body.modelLabel.trim(), body.mediaUrl.trim());
  return c.json({ ok: true });
});
app.delete('/api/arena/works/:id', (c) => {
  const id = Number(c.req.param('id'));
  if (!arenaAdmin.getWork(id)) throw new HttpError(404, '作品不存在');
  arenaAdmin.deleteWork(id);
  return c.json({ ok: true });
});

// —— 媒体上传（经存储适配器；默认本地落盘）——
const MAX_UPLOAD = 50 * 1024 * 1024;
app.post('/api/upload', async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!file || typeof file === 'string') throw new HttpError(400, '缺少文件');
  if (file.size > MAX_UPLOAD) throw new HttpError(413, '文件超过 50MB 上限');
  try {
    const url = await storage.upload(Buffer.from(await file.arrayBuffer()), file.name);
    return c.json({ url, adapter: storage.name });
  } catch (err) {
    throw new HttpError(400, err.message);
  }
});

// —— 构建 ——
app.post('/api/build', (c) => {
  const result = startBuild();
  return c.json(result, result.started ? 202 : 409);
});
app.get('/api/build/status', (c) => c.json(buildStatus()));

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error('[admin]', err);
  const payload = { error: err.message || '服务器内部错误' };
  if (err instanceof HttpError && err.details) payload.details = err.details;
  if (c.req.path.startsWith('/api/') || !c.req.header('accept')?.includes('text/html')) {
    return c.json(payload, status);
  }
  return c.html(
    layout({
      title: `出错了（${status}）`,
      active: '',
      body: html`<div class="ts-card" style="padding:2rem">
        <h1 style="font-size:1.4rem">出错了（${status}）</h1>
        <p style="margin-top:0.8rem;color:var(--text-muted)">${payload.error}</p>
        <p style="margin-top:1.2rem"><a class="ts-btn ts-btn-ghost" href="/">回总览</a></p>
      </div>`,
    }),
    status,
  );
});

const firstPassword = ensureAdminUser();
if (firstPassword) {
  console.log('[admin] 已创建管理员账号 admin，初始密码（只显示这一次，请立即记下）：');
  console.log(`[admin]   ${firstPassword}`);
  console.log('[admin] 忘记密码时：node admin/reset-password.mjs <新密码>');
}

serve({ fetch: app.fetch, port: PORT });
console.log(`[admin] 管理后台已启动：http://localhost:${PORT}（存储适配器：${storage.name}）`);
