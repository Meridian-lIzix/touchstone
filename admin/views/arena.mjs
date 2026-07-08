// Arena 管理视图：prompt 列表 + 单个 prompt 的作品管理（含本地上传）
import { html } from 'hono/html';
import { layout } from './layout.mjs';

const CATEGORY_HINT = '已有品类：image / code / text，可自定义新品类';
const isImageUrl = (url) => /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(url || '');
const contentTypeOf = (work) => work.content_type || work.category || 'unknown';

function workPreview(work) {
  const url = work.media_url || '';
  const type = contentTypeOf(work);
  if (!url || url === 'placeholder') {
    return html`<span class="adm-work-preview adm-work-empty"><span class="adm-badge">占位</span></span>`;
  }
  if (type === 'image' || isImageUrl(url)) {
    return html`<a class="adm-work-preview" data-work-preview href="${url}" target="_blank" rel="noreferrer">
      <img class="adm-media-preview adm-work-thumb" src="${url}" alt="" loading="lazy" />
      <span class="adm-work-open">打开原作</span>
    </a>`;
  }
  return html`<a class="adm-work-preview adm-work-document" data-work-preview href="${url}" target="_blank" rel="noreferrer">
    <span class="adm-badge">${type}</span>
    <span class="adm-work-text">${work.preview_text || url}</span>
    <span class="adm-work-open">打开原文</span>
  </a>`;
}

export function arenaPage(prompts) {
  const categories = [...new Set(prompts.map((p) => p.category).filter(Boolean))].sort();
  const workCounts = [...new Set(prompts.map((p) => Number(p.work_count) || 0))].sort((a, b) => a - b);
  const body = html`
    <div class="adm-page-head">
      <div>
        <p class="ts-eyebrow">Arena</p>
        <h1>盲评 Prompt</h1>
      </div>
    </div>

    <section class="ts-card ts-rise adm-form" style="padding:1.4rem;margin-bottom:1.1rem">
      <h2 style="font-size:1.05rem;font-weight:600">新建 prompt</h2>
      <div class="adm-row">
        <input type="text" id="np-category" list="cat-list" placeholder="品类（如 image）" style="max-width:11rem" />
        <datalist id="cat-list">
          <option value="image"></option><option value="code"></option><option value="text"></option>
        </datalist>
        <input type="text" id="np-text" placeholder="prompt 文本" />
        <input type="text" id="np-note" placeholder="备注（可空）" style="max-width:14rem" />
        <button class="ts-btn ts-btn-primary" id="np-add" type="button">添加</button>
      </div>
      <span class="hint" style="font-size:0.75rem;color:var(--text-muted)">${CATEGORY_HINT}</span>
    </section>

    <section class="ts-card ts-rise adm-filterbar" style="animation-delay:70ms">
      <div class="adm-filter-row">
        <input type="text" id="prompt-filter-q" placeholder="搜索 ID / prompt" />
        <select id="prompt-filter-count" style="max-width:11rem">
          <option value="">全部作品数</option>
          <option value="pairable">可配对（≥2）</option>
          <option value="blocked">不足 2 件</option>
          ${workCounts.map((n) => html`<option value="eq:${n}">${n} 件</option>`)}
        </select>
        <button class="ts-btn ts-btn-ghost" id="prompt-filter-reset" type="button">重置</button>
        <span class="hint adm-filter-status" id="prompt-filter-status"></span>
      </div>
      <div class="adm-filter-row">
        <button class="ts-btn ts-btn-ghost ts-btn-sm adm-filter-chip" type="button" data-cat-filter="" aria-pressed="true">全部</button>
        ${categories.map((category) => html`
          <button class="ts-btn ts-btn-ghost ts-btn-sm adm-filter-chip" type="button" data-cat-filter="${category}" aria-pressed="false">${category}</button>
        `)}
      </div>
    </section>

    <section class="ts-card ts-rise" style="overflow:hidden;animation-delay:90ms">
      <table class="adm-table">
        <thead>
          <tr><th style="width:3.5rem">ID</th><th style="width:6rem">品类</th><th>Prompt</th><th style="width:5.5rem">作品数</th><th style="width:9rem"></th></tr>
        </thead>
        <tbody id="prompt-rows">
          ${prompts.length === 0
            ? html`<tr><td colspan="5" style="color:var(--text-muted)">还没有 prompt。</td></tr>`
            : prompts.map(
                (p) => html`<tr data-category="${p.category}" data-work-count="${p.work_count}" data-query="${`${p.id} ${p.category} ${p.text}`.toLowerCase()}">
                  <td class="ts-num">${p.id}</td>
                  <td><span class="adm-badge">${p.category}</span></td>
                  <td>${p.text}</td>
                  <td class="ts-num">${p.work_count}</td>
                  <td style="text-align:right;white-space:nowrap">
                    <a class="ts-btn ts-btn-ghost ts-btn-sm" href="/arena/prompts/${p.id}">管理作品</a>
                    <button class="ts-btn ts-btn-danger ts-btn-sm" data-del="${p.id}">删除</button>
                  </td>
                </tr>`,
              )}
          <tr id="prompt-filter-empty" hidden><td colspan="5" style="color:var(--text-muted)">没有符合筛选条件的 prompt。</td></tr>
        </tbody>
      </table>
    </section>
  `;
  const script = `
    const promptRows = Array.from(document.querySelectorAll('#prompt-rows tr[data-category]'));
    const promptFilterQ = document.getElementById('prompt-filter-q');
    const promptFilterCount = document.getElementById('prompt-filter-count');
    const promptFilterStatus = document.getElementById('prompt-filter-status');
    const promptFilterEmpty = document.getElementById('prompt-filter-empty');
    const catButtons = Array.from(document.querySelectorAll('[data-cat-filter]'));
    let activeCategory = '';

    function matchesCount(row, value) {
      const count = Number(row.dataset.workCount || 0);
      if (!value) return true;
      if (value === 'pairable') return count >= 2;
      if (value === 'blocked') return count < 2;
      if (value.startsWith('eq:')) return count === Number(value.slice(3));
      return true;
    }

    function applyPromptFilters() {
      const q = promptFilterQ.value.trim().toLowerCase();
      const countFilter = promptFilterCount.value;
      let shown = 0;
      promptRows.forEach((row) => {
        const ok =
          (!activeCategory || row.dataset.category === activeCategory) &&
          (!q || row.dataset.query.includes(q)) &&
          matchesCount(row, countFilter);
        row.hidden = !ok;
        if (ok) shown += 1;
      });
      promptFilterStatus.textContent = shown + ' / ' + promptRows.length + ' 条';
      if (promptFilterEmpty) promptFilterEmpty.hidden = shown !== 0 || promptRows.length === 0;
    }

    catButtons.forEach((btn) => {
      btn.onclick = () => {
        activeCategory = btn.dataset.catFilter;
        catButtons.forEach((item) => item.setAttribute('aria-pressed', item === btn ? 'true' : 'false'));
        applyPromptFilters();
      };
    });
    promptFilterQ.addEventListener('input', applyPromptFilters);
    promptFilterCount.addEventListener('change', applyPromptFilters);
    document.getElementById('prompt-filter-reset').onclick = () => {
      activeCategory = '';
      promptFilterQ.value = '';
      promptFilterCount.value = '';
      catButtons.forEach((item) => item.setAttribute('aria-pressed', item.dataset.catFilter === '' ? 'true' : 'false'));
      applyPromptFilters();
    };
    applyPromptFilters();

    document.getElementById('np-add').onclick = async () => {
      try {
        await api('/api/arena/prompts', {
          method: 'POST',
          body: {
            category: document.getElementById('np-category').value.trim(),
            text: document.getElementById('np-text').value.trim(),
            note: document.getElementById('np-note').value.trim() || undefined,
          },
        });
        toast('已添加');
        setTimeout(() => location.reload(), 400);
      } catch (err) { toast(err.message, true); }
    };
    document.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('删除该 prompt 会连同其所有作品与相关投票一起删除，确认？')) return;
        try {
          await api('/api/arena/prompts/' + btn.dataset.del, { method: 'DELETE' });
          toast('已删除');
          setTimeout(() => location.reload(), 400);
        } catch (err) { toast(err.message, true); }
      };
    });
  `;
  return layout({ title: 'Arena', active: '/arena', body, script });
}

export function promptDetailPage(prompt, works) {
  const body = html`
    <div class="adm-page-head adm-detail-head">
      <div>
        <p class="ts-eyebrow">Arena · Prompt #${prompt.id}</p>
        <h1 style="font-size:1.5rem">${prompt.text}</h1>
      </div>
      <a class="ts-btn ts-btn-ghost" href="/arena">返回列表</a>
    </div>

    <section class="ts-card ts-rise adm-form" style="padding:1.4rem;margin-bottom:1.1rem">
      <h2 style="font-size:1.05rem;font-weight:600">编辑 prompt</h2>
      <div class="adm-row">
        <input type="text" id="p-category" value="${prompt.category}" style="max-width:11rem" />
        <input type="text" id="p-text" value="${prompt.text}" />
        <input type="text" id="p-note" value="${prompt.note ?? ''}" placeholder="备注（可空）" style="max-width:14rem" />
        <button class="ts-btn ts-btn-primary" id="p-save" type="button">保存</button>
      </div>
      <span class="hint" style="font-size:0.75rem;color:var(--text-muted)">改品类会同步该 prompt 下所有作品的品类。${CATEGORY_HINT}</span>
    </section>

    <section class="ts-card ts-rise adm-form" style="padding:1.4rem;margin-bottom:1.1rem;animation-delay:90ms">
      <h2 style="font-size:1.05rem;font-weight:600">新增作品</h2>
      <div class="adm-row">
        <input type="text" id="nw-model" placeholder="真实模型标签（对访客隐藏）" style="max-width:16rem" />
        <input type="text" id="nw-media" placeholder="媒体 URL（可手填，或右侧上传）" />
        <label class="ts-btn ts-btn-ghost" style="white-space:nowrap">
          上传文件<input type="file" id="nw-file" hidden />
        </label>
        <button class="ts-btn ts-btn-primary" id="nw-add" type="button">添加作品</button>
      </div>
      <div class="adm-media-cell" id="nw-preview" style="display:none">
        <img class="adm-media-preview" id="nw-preview-img" alt="" />
        <span class="adm-media-url" id="nw-preview-url"></span>
      </div>
    </section>

    <section class="ts-card ts-rise" style="overflow:hidden;animation-delay:180ms">
      <table class="adm-table">
        <thead>
          <tr><th style="width:3.5rem">ID</th><th style="width:13rem">原作品</th><th>模型标签 / 媒体 URL</th><th style="width:6rem">Elo</th><th style="width:5rem">票数</th><th style="width:9rem"></th></tr>
        </thead>
        <tbody id="works-body">
          ${works.length === 0
            ? html`<tr><td colspan="6" style="color:var(--text-muted)">该 prompt 下还没有作品。盲评配对需要至少 2 件。</td></tr>`
            : works.map(
                (w) => html`<tr data-work-row="${w.id}">
                  <td class="ts-num">${w.id}</td>
                  <td>${workPreview(w)}</td>
                  <td>
                    <div class="adm-work-fields">
                      <input type="text" data-work-model="${w.id}" value="${w.model_label ?? ''}" placeholder="模型标签" />
                      <input class="ts-num" type="text" data-work-media="${w.id}" value="${w.media_url ?? ''}" placeholder="媒体 URL" />
                      <label class="ts-btn ts-btn-ghost ts-btn-sm">
                        上传替换<input type="file" data-work-file="${w.id}" hidden />
                      </label>
                    </div>
                  </td>
                  <td class="ts-num">${Math.round(w.elo)}</td>
                  <td class="ts-num">${w.vote_count}</td>
                  <td style="text-align:right;white-space:nowrap">
                    <button class="ts-btn ts-btn-ghost ts-btn-sm" data-work-save="${w.id}" type="button">保存</button>
                    <button class="ts-btn ts-btn-danger ts-btn-sm" data-work-delete="${w.id}" type="button">删除</button>
                  </td>
                </tr>`,
              )}
        </tbody>
      </table>
    </section>
  `;
  const script = `
    const promptId = ${prompt.id};

    const isImg = (u) => /\.(png|jpe?g|webp|gif|svg)($|\?)/i.test(u || '');
    function updateWorkPreview(row, url) {
      const link = row.querySelector('[data-work-preview]');
      if (!link || !url) return;
      link.href = url;
      const img = link.querySelector('img');
      if (img && isImg(url)) img.src = url;
    }

    document.querySelectorAll('[data-work-file]').forEach((input) => {
      input.onchange = async () => {
        if (!input.files[0]) return;
        const row = input.closest('[data-work-row]');
        try {
          const r = await apiUpload(input.files[0]);
          const mediaInput = row.querySelector('[data-work-media]');
          mediaInput.value = r.url;
          updateWorkPreview(row, r.url);
          toast('已上传，记得点保存');
        } catch (err) { toast(err.message, true); }
      };
    });

    document.querySelectorAll('[data-work-save]').forEach((btn) => {
      btn.onclick = async () => {
        const row = btn.closest('[data-work-row]');
        const modelInput = row.querySelector('[data-work-model]');
        const mediaInput = row.querySelector('[data-work-media]');
        try {
          await api('/api/arena/works/' + btn.dataset.workSave, {
            method: 'PUT',
            body: { modelLabel: modelInput.value.trim(), mediaUrl: mediaInput.value.trim() },
          });
          updateWorkPreview(row, mediaInput.value.trim());
          toast('已保存');
        } catch (err) { toast(err.message, true); }
      }
    });

    document.querySelectorAll('[data-work-delete]').forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm('删除该作品会连同相关投票一起删除，确认？')) return;
        try {
          await api('/api/arena/works/' + btn.dataset.workDelete, { method: 'DELETE' });
          toast('已删除');
          btn.closest('[data-work-row]').remove();
        } catch (err) { toast(err.message, true); }
      };
    });

    document.getElementById('p-save').onclick = async () => {
      try {
        await api('/api/arena/prompts/' + promptId, {
          method: 'PUT',
          body: {
            category: document.getElementById('p-category').value.trim(),
            text: document.getElementById('p-text').value.trim(),
            note: document.getElementById('p-note').value.trim() || undefined,
          },
        });
        toast('已保存');
      } catch (err) { toast(err.message, true); }
    };

    document.getElementById('nw-file').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const r = await apiUpload(file);
        document.getElementById('nw-media').value = r.url;
        const box = document.getElementById('nw-preview');
        box.style.display = 'flex';
        document.getElementById('nw-preview-url').textContent = r.url;
        if (isImg(r.url)) document.getElementById('nw-preview-img').src = r.url;
        toast('已上传');
      } catch (err) { toast(err.message, true); }
    };

    document.getElementById('nw-add').onclick = async () => {
      try {
        await api('/api/arena/works', {
          method: 'POST',
          body: {
            promptId,
            modelLabel: document.getElementById('nw-model').value.trim(),
            mediaUrl: document.getElementById('nw-media').value.trim(),
          },
        });
        toast('已添加');
        setTimeout(() => location.reload(), 400);
      } catch (err) { toast(err.message, true); }
    };
  `;
  return layout({ title: `Prompt #${prompt.id}`, active: '/arena', body, script });
}
