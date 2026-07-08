// 站点重建：子进程跑 pnpm build，进程内互斥锁保证同一时刻只有一个构建
// 小 VPS 上并发构建会 OOM，宁可让第二次触发直接被拒绝
import { spawn } from 'node:child_process';
import { REPO_ROOT } from './content.mjs';

const LOG_LIMIT = 64 * 1024;

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

export function startBuild() {
  if (state.running) return { started: false, reason: 'already_running' };
  state.running = true;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.ok = null;
  state.log = '';

  // Windows 下 pnpm 是 .cmd 垫片，必须经 shell 启动
  const child = spawn('pnpm', ['build'], {
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
    env: process.env,
  });
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
    state.running = false;
    state.ok = false;
    state.finishedAt = new Date().toISOString();
  });
  child.on('close', (code) => {
    if (!state.running) return;
    state.running = false;
    state.ok = code === 0;
    state.finishedAt = new Date().toISOString();
  });
  return { started: true };
}
