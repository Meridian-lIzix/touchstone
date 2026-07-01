// Arena 盲评后端：只处理匿名对子、投票、Elo 算分、翻牌和排行榜
// 合规边界：站内不生成内容，所有作品由站长离线生成后再入库
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { db, sha, pairKey, updateElo } from './db.mjs';

// 初始化 API 应用；当前是本地开发跨域，上线时要收紧到正式前端域名
const app = new Hono();
app.use('/api/*', cors());

// 复用常用查询和翻牌返回格式，避免每个接口重复写模型揭示逻辑
const getWork = db.prepare('SELECT * FROM works WHERE id = ?');
const reveal = (...works) =>
  Object.fromEntries(works.map((w) => [w.id, { model: w.model_label }]));

// 向前端提供可切换品类，来源以数据库已有作品为准
app.get('/api/categories', (c) =>
  c.json({ categories: db.prepare('SELECT DISTINCT category FROM works ORDER BY category').all().map((r) => r.category) }),
);

// 随机挑一个至少有两件作品的 prompt，再随机返回两件匿名作品
app.get('/api/arena/pair', (c) => {
  // 品类缺省为 image，保证首页盲评在没有 query 时也能拿到数据
  const category = c.req.query('category') || 'image';
  const prompt = db
    .prepare(
      `SELECT p.* FROM prompts p
       WHERE p.category = ? AND (SELECT COUNT(*) FROM works w WHERE w.prompt_id = p.id) >= 2
       ORDER BY RANDOM() LIMIT 1`,
    )
    .get(category);
  if (!prompt) return c.json({ error: 'no_prompts' }, 404);

  // 只下发作品 id 和媒体地址，投票前不暴露模型标签
  const works = db
    .prepare('SELECT id, media_url FROM works WHERE prompt_id = ? ORDER BY RANDOM() LIMIT 2')
    .all(prompt.id);
  return c.json({
    promptId: prompt.id,
    category,
    prompt: prompt.text,
    works: works.map((w) => ({ id: w.id, mediaUrl: w.media_url })),
  });
});

// 接收一次盲选结果，校验对子有效后写入投票并更新 Elo
app.post('/api/vote', async (c) => {
  // 请求体只接受赢家、输家和可选设备指纹；异常 JSON 直接按空对象处理
  const { winnerId, loserId, fp } = await c.req.json().catch(() => ({}));
  if (!winnerId || !loserId || winnerId === loserId) return c.json({ error: 'bad_request' }, 400);

  // 两个作品必须存在，且必须来自同一个 prompt，避免跨题目投票污染榜单
  const a = getWork.get(winnerId);
  const b = getWork.get(loserId);
  if (!a || !b || a.prompt_id !== b.prompt_id) return c.json({ error: 'invalid_pair' }, 400);

  // IP 与设备指纹只存哈希，用于限速和去重，不保存原始标识
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
  const ipHash = sha(ip);
  const fpHash = fp ? sha(fp) : null;
  const pk = pairKey(winnerId, loserId);

  // IP 限速兜底：10 分钟内最多 60 票，防止无痕窗口反复刷票
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = db.prepare('SELECT COUNT(*) AS n FROM votes WHERE ip_hash = ? AND created_at > ?').get(ipHash, tenMinAgo).n;
  if (recent >= 60) return c.json({ error: 'rate_limited' }, 429);

  // 设备去重：同一设备同一对子只计一次，但仍返回翻牌结果
  if (fpHash && db.prepare('SELECT 1 FROM votes WHERE fp_hash = ? AND pair_key = ? LIMIT 1').get(fpHash, pk)) {
    return c.json({ ok: true, deduped: true, revealed: reveal(a, b) });
  }

  // 合法新票才更新双方 Elo、累加样本量，并留下投票审计记录
  const { winner, loser } = updateElo(a.elo, b.elo);
  db.prepare('UPDATE works SET elo = ?, vote_count = vote_count + 1 WHERE id = ?').run(winner, a.id);
  db.prepare('UPDATE works SET elo = ?, vote_count = vote_count + 1 WHERE id = ?').run(loser, b.id);
  db.prepare(
    `INSERT INTO votes (category, prompt_id, winner_id, loser_id, fp_hash, ip_hash, pair_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(a.category, a.prompt_id, a.id, b.id, fpHash, ipHash, pk, new Date().toISOString());

  return c.json({ ok: true, revealed: reveal(a, b) });
});

// 单件作品翻牌接口，用于前端需要补查模型名的场景
app.get('/api/work/:id/reveal', (c) => {
  const w = getWork.get(c.req.param('id'));
  return w ? c.json({ id: w.id, model: w.model_label }) : c.json({ error: 'not_found' }, 404);
});

// 排行榜按模型聚合 Elo 和样本量；盲评只隐藏投票过程，榜单会展示模型名
app.get('/api/leaderboard', (c) => {
  const category = c.req.query('category') || 'image';
  const rows = db
    .prepare(
      `SELECT model_label AS model, AVG(elo) AS elo, SUM(vote_count) AS votes, COUNT(*) AS works
       FROM works WHERE category = ? GROUP BY model_label ORDER BY elo DESC`,
    )
    .all(category);
  return c.json({
    category,
    models: rows.map((r, i) => ({
      rank: i + 1,
      model: r.model,
      elo: Math.round(r.elo),
      votes: r.votes ?? 0,
      works: r.works,
    })),
  });
});

// 启动 Node HTTP 服务；PORT 可由环境变量覆盖，默认给前端本地联调使用
const port = Number(process.env.PORT) || 8787;
serve({ fetch: app.fetch, port });
console.log(`[arena] API 已启动：http://localhost:${port}`);
