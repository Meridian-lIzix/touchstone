// 总览页：内容/Arena 概况 + 构建卡片（触发 pnpm build、轮询状态、看日志）
import { html } from 'hono/html';
import { layout } from './layout.mjs';
import { COLLECTIONS } from '../schemas.mjs';

export function dashboardPage({ contentCounts, arenaCounts, build }) {
  const buildBadge = build.running
    ? html`<span class="adm-badge adm-badge-draft">构建中…</span>`
    : build.ok === null
      ? html`<span class="adm-badge">尚未构建</span>`
      : build.ok
        ? html`<span class="adm-badge adm-badge-ok">上次成功</span>`
        : html`<span class="adm-badge adm-badge-bad">上次失败</span>`;

  const body = html`
    <div class="adm-page-head">
      <div>
        <p class="ts-eyebrow">Dashboard</p>
        <h1>总览</h1>
      </div>
    </div>

    <div class="adm-grid-2">
      <section class="ts-card ts-rise" style="padding:1.4rem">
        <h2 style="font-size:1.15rem;font-weight:600">内容</h2>
        <table class="adm-table" style="margin-top:0.8rem">
          <tbody>
            ${Object.entries(COLLECTIONS).map(
              ([key, meta]) => html`<tr>
                <td><a href="/content/${key}" style="color:var(--primary)">${meta.label}</a></td>
                <td class="ts-num" style="text-align:right">${contentCounts[key].total} 篇</td>
                <td style="text-align:right;color:var(--text-muted);font-size:0.8rem">
                  ${contentCounts[key].drafts > 0 ? `${contentCounts[key].drafts} 篇草稿` : '—'}
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
        <p class="hint" style="margin-top:0.8rem;font-size:0.78rem;color:var(--text-muted)">
          内容保存即自动 git commit；推送到远端仍需手动执行。
        </p>
      </section>

      <section class="ts-card ts-rise" style="padding:1.4rem;animation-delay:90ms">
        <h2 style="font-size:1.15rem;font-weight:600">Arena</h2>
        <table class="adm-table" style="margin-top:0.8rem">
          <tbody>
            <tr>
              <td><a href="/arena" style="color:var(--primary)">Prompt</a></td>
              <td class="ts-num" style="text-align:right">${arenaCounts.prompts} 个</td>
            </tr>
            <tr>
              <td>作品</td>
              <td class="ts-num" style="text-align:right">${arenaCounts.works} 件</td>
            </tr>
            <tr>
              <td>累计投票</td>
              <td class="ts-num" style="text-align:right">${arenaCounts.votes} 票</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <section class="ts-card ts-rise" style="padding:1.4rem;margin-top:1.1rem;animation-delay:180ms">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:0.8rem">
          <h2 style="font-size:1.15rem;font-weight:600">站点构建</h2>
          <span id="build-badge">${buildBadge}</span>
        </div>
        <button class="ts-btn ts-btn-primary" id="build-btn" ${build.running ? 'disabled' : ''}>
          重新构建站点
        </button>
      </div>
      <p style="margin-top:0.5rem;font-size:0.82rem;color:var(--text-muted)">
        执行仓库根目录的 <code class="ts-num">pnpm build</code>；同一时刻只允许一个构建。
        构建期间建议先停掉 <code class="ts-num">pnpm dev</code>（两者会抢 .astro 缓存）。
      </p>
      <pre class="adm-log" id="build-log" style="margin-top:1rem">${build.log || '（暂无日志）'}</pre>
    </section>
  `;

  const script = `
    const badge = document.getElementById('build-badge');
    const btn = document.getElementById('build-btn');
    const logEl = document.getElementById('build-log');
    function renderStatus(s) {
      btn.disabled = s.running;
      badge.innerHTML = s.running
        ? '<span class="adm-badge adm-badge-draft">构建中…</span>'
        : s.ok === null
          ? '<span class="adm-badge">尚未构建</span>'
          : s.ok
            ? '<span class="adm-badge adm-badge-ok">上次成功</span>'
            : '<span class="adm-badge adm-badge-bad">上次失败</span>';
      logEl.textContent = s.log || '（暂无日志）';
      logEl.scrollTop = logEl.scrollHeight;
    }
    let timer = null;
    async function poll() {
      const s = await api('/api/build/status');
      renderStatus(s);
      if (s.running) timer = setTimeout(poll, 2000);
      else if (timer) { timer = null; toast(s.ok ? '构建成功' : '构建失败，见日志', !s.ok); }
    }
    btn.onclick = async () => {
      try {
        const r = await api('/api/build', { method: 'POST' });
        if (!r.started) { toast('已有构建在进行中', true); return; }
        toast('构建已开始');
        timer = setTimeout(poll, 1500);
      } catch (err) { toast(err.message, true); }
    };
    ${'' /* 打开页面时若构建仍在跑，继续轮询 */}
    api('/api/build/status').then((s) => { renderStatus(s); if (s.running) timer = setTimeout(poll, 2000); });
  `;

  return layout({ title: '总览', active: '/', body, script });
}
