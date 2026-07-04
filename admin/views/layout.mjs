// 后台页面壳：与主站 Base.astro 同构——无闪烁主题脚本、颗粒噪点、吸顶导航
import { html, raw } from 'hono/html';

// 注入 <script> 的 JSON 要转义 <，防止 </script> 提前闭合
export const jsonForScript = (value) => raw(JSON.stringify(value).replace(/</g, '\\u003c'));

const NAV = [
  ['/', '总览'],
  ['/content/reviews', '测评'],
  ['/content/comparisons', '横评'],
  ['/content/collections', '合集'],
  ['/content/news', '情报'],
  ['/arena', 'Arena'],
];

export function layout({ title, active, body, script }) {
  return html`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="light" />
    <script>
      (() => {
        try {
          const t = localStorage.getItem('ts-theme');
          if (t === 'dark' || t === 'light') {
            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.style.colorScheme = t;
          }
        } catch (e) {}
      })();
    </script>
    <title>${title} · Touchstone 管理后台</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/tokens.css" />
    <link rel="stylesheet" href="/assets/admin.css" />
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>
    <header class="adm-header">
      <div class="adm-header-inner">
        <a class="adm-wordmark" href="/">Touchstone<small>Admin</small></a>
        <nav class="adm-nav">
          ${NAV.map(
            ([href, label]) =>
              html`<a href="${href}" ${active === href ? raw('aria-current="page"') : ''}>${label}</a>`,
          )}
        </nav>
        <div class="adm-header-tools">
          <button class="adm-icon-btn" data-theme-toggle title="切换深浅色" aria-label="切换深浅色">◐</button>
          <button class="ts-btn ts-btn-ghost ts-btn-sm" id="adm-logout">退出</button>
        </div>
      </div>
    </header>
    <main class="adm-main">${body}</main>
    <script src="/assets/admin.js"></script>
    <script>
      document.getElementById('adm-logout').onclick = async () => {
        await fetch('/api/logout', { method: 'POST' });
        location.href = '/login';
      };
    </script>
    ${script ? html`<script>${raw(script)}</script>` : ''}
  </body>
</html>`;
}

export function loginPage() {
  return html`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="light" />
    <script>
      (() => {
        try {
          const t = localStorage.getItem('ts-theme');
          if (t === 'dark' || t === 'light') {
            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.style.colorScheme = t;
          }
        } catch (e) {}
      })();
    </script>
    <title>登录 · Touchstone 管理后台</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/assets/tokens.css" />
    <link rel="stylesheet" href="/assets/admin.css" />
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>
    <main class="adm-login">
      <form class="ts-card adm-login-card adm-form ts-rise" id="login-form">
        <div>
          <p class="ts-eyebrow">Touchstone · Admin</p>
          <h1 style="font-size:1.6rem;font-weight:600;margin-top:0.5rem">管理后台</h1>
        </div>
        <div class="adm-field">
          <label for="username">用户名</label>
          <input type="text" id="username" autocomplete="username" required />
        </div>
        <div class="adm-field">
          <label for="password">密码</label>
          <input type="password" id="password" autocomplete="current-password" required />
        </div>
        <button class="ts-btn ts-btn-primary" type="submit">登录</button>
      </form>
    </main>
    <script src="/assets/admin.js"></script>
    <script>
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('/api/login', {
            method: 'POST',
            body: {
              username: document.getElementById('username').value,
              password: document.getElementById('password').value,
            },
          });
          location.href = '/';
        } catch (err) {
          toast(err.message, true);
        }
      });
    </script>
  </body>
</html>`;
}
