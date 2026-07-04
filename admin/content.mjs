// 内容层：读写 src/content 下的 Markdown（frontmatter + 正文），git 提交作为审计轨迹
// 内容不进数据库——文件 + git 始终是唯一权威来源
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';
import { COLLECTIONS } from './schemas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, '..');

// slug 白名单校验兼防路径穿越；文件名即 URL slug
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

function collectionDir(collection) {
  const meta = COLLECTIONS[collection];
  if (!meta) throw new HttpError(404, `未知集合：${collection}`);
  return { meta, dir: join(REPO_ROOT, meta.dir) };
}

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function assertSlug(slug) {
  if (!SLUG_RE.test(slug)) throw new HttpError(400, 'slug 只能用小写字母、数字和连字符');
  return slug;
}

export function parseMarkdown(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  return { data: YAML.parse(m[1]) ?? {}, body: m[2].replace(/^\r?\n/, '') };
}

// 序列化规则：按 schema 定义顺序输出键；可选字段缺省不写；
// 默认为 false 的布尔只在 true 时写（与现有手写文件的习惯一致，diff 更干净）
function serializeFrontmatter(schema, data) {
  const out = {};
  for (const key of Object.keys(schema.shape)) {
    let value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (value === false) continue;
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    out[key] = value;
  }
  return YAML.stringify(out, { lineWidth: 0 });
}

function entryPath(collection, slug) {
  const { dir } = collectionDir(collection);
  return join(dir, `${assertSlug(slug)}.md`);
}

export function listEntries(collection) {
  const { dir } = collectionDir(collection);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.slice(0, -3);
      const { data } = parseMarkdown(readFileSync(join(dir, f), 'utf8'));
      return {
        slug,
        title: data.title ?? slug,
        date: data.date ? String(data.date).slice(0, 10) : '',
        draft: Boolean(data.draft),
        sample: Boolean(data.sample),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function readEntry(collection, slug) {
  const path = entryPath(collection, slug);
  if (!existsSync(path)) throw new HttpError(404, `${collection}/${slug}.md 不存在`);
  const { data, body } = parseMarkdown(readFileSync(path, 'utf8'));
  return { slug, data, body };
}

export function saveEntry(collection, slug, data, body, { isNew = false } = {}) {
  const { meta, dir } = collectionDir(collection);
  const path = entryPath(collection, slug);
  if (isNew && existsSync(path)) throw new HttpError(409, `slug「${slug}」已存在`);
  if (!isNew && !existsSync(path)) throw new HttpError(404, `${collection}/${slug}.md 不存在`);

  const parsed = meta.schema.safeParse(data);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new HttpError(422, 'frontmatter 校验未通过', issues);
  }

  mkdirSync(dir, { recursive: true });
  const fm = serializeFrontmatter(meta.schema, parsed.data);
  const trimmed = String(body ?? '').replace(/\r\n/g, '\n').trim();
  writeFileSync(path, `---\n${fm}---\n${trimmed ? `\n${trimmed}\n` : ''}`, 'utf8');

  const verb = isNew ? 'add' : 'update';
  gitCommit(`content: ${verb} ${collection}/${slug}.md`, path);
  return readEntry(collection, slug);
}

export function deleteEntry(collection, slug) {
  const path = entryPath(collection, slug);
  if (!existsSync(path)) throw new HttpError(404, `${collection}/${slug}.md 不存在`);
  rmSync(path);
  gitCommit(`content: delete ${collection}/${slug}.md`, path);
}

// 只 add + commit 改动的那个文件，绝不 push——推送保持手动
// 机器上没配 git 身份时以 Touchstone Admin 落款兜底，已有配置则原样尊重
let identityArgs;
function gitIdentityArgs(run) {
  if (identityArgs) return identityArgs;
  const email = run(['config', 'user.email']);
  identityArgs =
    email.status === 0 && email.stdout.trim()
      ? []
      : ['-c', 'user.name=Touchstone Admin', '-c', 'user.email=admin@touchstone.local'];
  return identityArgs;
}

function gitCommit(message, path) {
  const run = (args) => spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  const add = run(['add', '--', path]);
  if (add.status !== 0) throw new HttpError(500, `git add 失败：${add.stderr || add.stdout}`);
  const commit = run([...gitIdentityArgs(run), 'commit', '-m', message, '--', path]);
  if (commit.status !== 0) {
    // 内容无变化时 git 会拒绝空提交，属正常情况，不视为错误
    const text = `${commit.stdout}\n${commit.stderr}`;
    if (/nothing to commit|no changes added/i.test(text)) return { committed: false };
    throw new HttpError(500, `git commit 失败：${text.trim()}`);
  }
  return { committed: true };
}
