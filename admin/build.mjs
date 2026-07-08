// 站点重建：子进程跑 astro build，进程内互斥锁保证同一时刻只有一个构建
// 小 VPS 上并发构建会 OOM，宁可让第二次触发直接被拒绝
// 零中断：构建到 dist.next，成功后原子 rename 替换 dist，前台不会在重建期间断
import { spawn } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './content.mjs';

const LOG_LIMIT = 64 * 1024;

const DIST = join(REPO_ROOT, 'dist');
const NEXT = join(REPO_ROOT, 'dist.next');
const PREV = join(REPO_ROOT, 'dist.prev');

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  log: '',
};

export function buildStatus() {
  return { ...state, log: state.log.slice(-LOG_LIMIT) };
}

// 把构建产物就位为正式 dist：先挪走旧 dist 再移入新的，两次 rename 都是同盘元数据操作
// （微秒级），期间正在服务的旧 dist 完整存在，换上后旧目录才删除
function swapInNewDist() {
  if (existsSync(PREV)) rmSync(PREV, { recursive: true, force: true });
  if (existsSync(DIST)) renameSync(DIST, PREV);
  renameSync(NEXT, DIST);
  if (existsSync(PREV)) rmSync(PREV, { recursive: true, force: true });
}

export function startBuild() {
  if (state.running) return { started: false, reason: 'already_running' };
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.ok = null;
  state.log = '';

  // 清掉上次可能残留的临时目录，避免脏产物混入
  for (const dir of [NEXT, PREV]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  // 直接用当前 node 执行 astro 入口，绕过 node_modules/.bin/astro 垫片
  // 生产用 tar 跨机搬运 node_modules 会丢执行位，走垫片会 Permission denied
  // 限制堆内存，避免小内存机器在构建时 OOM；--outDir 让产物先落到临时目录
  const astroEntry = join(REPO_ROOT, 'node_modules', 'astro', 'astro.js');
  const child = spawn(
    process.execPath,
    ['--max-old-space-size=2048', astroEntry, 'build', '--outDir', 'dist.next'],
    { cwd: REPO_ROOT, env: process.env },
  );
  // 显式按 UTF-8 解码，避免多字节字符被 chunk 边界截断成乱码
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const append = (chunk) => {
    state.log = (state.log + chunk).slice(-LOG_LIMIT);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (err) => {
    append(`\n[admin] 构建进程启动失败：${err.message}\n`);
    if (existsSync(NEXT)) rmSync(NEXT, { recursive: true, force: true });
    state.running = false;
    state.ok = false;
    state.finishedAt = new Date().toISOString();
  });
  child.on('close', (code) => {
    if (!state.running) return;
    if (code === 0) {
      // 只有构建整体成功才切换；切换失败保留旧 dist，不让站点崩
      try {
        swapInNewDist();
        state.ok = true;
      } catch (err) {
        append(`\n[admin] 构建成功但切换 dist 失败：${err.message}\n`);
        if (existsSync(NEXT)) rmSync(NEXT, { recursive: true, force: true });
        state.ok = false;
      }
    } else {
      // 构建失败：丢弃半成品，旧 dist 原样保留
      if (existsSync(NEXT)) rmSync(NEXT, { recursive: true, force: true });
      state.ok = false;
    }
    state.running = false;
    state.finishedAt = new Date().toISOString();
  });
  return { started: true };
}
