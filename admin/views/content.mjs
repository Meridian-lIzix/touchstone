// 内容管理视图：四类集合的列表页 + 新建/编辑表单
// 表单静态字段服务端预填；横评的列/工具、合集的条目走注入 JSON 的动态行编辑器
import { html, raw } from 'hono/html';
import { layout, jsonForScript } from './layout.mjs';
import { COLLECTIONS } from '../schemas.mjs';

const dateOf = (v) => (v ? String(v).slice(0, 10) : '');

export function listPage(collection, entries) {
  const meta = COLLECTIONS[collection];
  const body = html`
    <div class="adm-page-head">
      <div>
        <p class="ts-eyebrow">Content · ${collection}</p>
        <h1>${meta.label}</h1>
      </div>
      <a class="ts-btn ts-btn-primary" href="/content/${collection}/new">新建</a>
    </div>
    <section class="ts-card ts-rise" style="overflow:hidden">
      <table class="adm-table">
        <thead>
          <tr><th>标题</th><th>slug</th><th>日期</th><th>状态</th><th style="width:9rem"></th></tr>
        </thead>
        <tbody>
          ${entries.length === 0
            ? html`<tr><td colspan="5" style="color:var(--text-muted)">还没有内容，点右上角「新建」。</td></tr>`
            : entries.map(
                (e) => html`<tr>
                  <td>${e.title}</td>
                  <td class="ts-num" style="font-size:0.78rem;color:var(--text-muted)">${e.slug}</td>
                  <td class="ts-num" style="font-size:0.82rem">${e.date}</td>
                  <td>
                    ${e.draft ? html`<span class="adm-badge adm-badge-draft">草稿</span>` : html`<span class="adm-badge adm-badge-ok">已发布</span>`}
                    ${e.sample ? html`<span class="adm-badge">示例</span>` : ''}
                  </td>
                  <td style="text-align:right;white-space:nowrap">
                    <a class="ts-btn ts-btn-ghost ts-btn-sm" href="/content/${collection}/${e.slug}/edit">编辑</a>
                    <button class="ts-btn ts-btn-danger ts-btn-sm" data-del="${e.slug}">删除</button>
                  </td>
                </tr>`,
              )}
        </tbody>
      </table>
    </section>
  `;
  const script = `
    document.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = async () => {
        const slug = btn.dataset.del;
        if (!confirm('确认删除「' + slug + '」？文件会被删除并生成一次 git 提交。')) return;
        try {
          await api('/api/content/${collection}/' + slug, { method: 'DELETE' });
          toast('已删除并提交');
          setTimeout(() => location.reload(), 500);
        } catch (err) { toast(err.message, true); }
      };
    });
  `;
  return layout({ title: meta.label, active: `/content/${collection}`, body, script });
}

// —— 表单公共片段 ——
const textField = (id, label, value = '', hint = '') => html`
  <div class="adm-field">
    <label for="f-${id}">${label}</label>
    <input type="text" id="f-${id}" value="${value ?? ''}" />
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
  </div>`;

const dateField = (id, label, value) => html`
  <div class="adm-field">
    <label for="f-${id}">${label}</label>
    <input type="date" id="f-${id}" value="${dateOf(value)}" />
  </div>`;

const areaField = (id, label, value = '', hint = '') => html`
  <div class="adm-field">
    <label for="f-${id}">${label}</label>
    <textarea id="f-${id}">${value ?? ''}</textarea>
    ${hint ? html`<span class="hint">${hint}</span>` : ''}
  </div>`;

const check = (id, label, on) => html`
  <label class="adm-check"><input type="checkbox" id="f-${id}" ${on ? 'checked' : ''} />${label}</label>`;

const selectField = (id, label, options, value) => html`
  <div class="adm-field">
    <label for="f-${id}">${label}</label>
    <select id="f-${id}">
      ${options.map((o) => html`<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`)}
    </select>
  </div>`;

const slugField = (slug, isNew) => html`
  <div class="adm-field">
    <label for="f-slug">slug（文件名 / URL）</label>
    <input type="text" id="f-slug" value="${slug ?? ''}" ${isNew ? '' : 'disabled'}
      placeholder="例如 cursor、photoroom" />
    ${isNew ? html`<span class="hint">小写字母、数字、连字符；保存后不可改</span>` : ''}
  </div>`;

const bodyField = (value) => html`
  <div class="adm-field">
    <label for="f-body">正文（Markdown）</label>
    <textarea id="f-body" class="adm-body">${value ?? ''}</textarea>
  </div>`;

const formShell = (collection, meta, isNew, slug, inner) => html`
  <div class="adm-page-head">
    <div>
      <p class="ts-eyebrow">Content · ${collection}</p>
      <h1>${isNew ? `新建${meta.label}` : `编辑：${slug}`}</h1>
    </div>
    <a class="ts-btn ts-btn-ghost" href="/content/${collection}">返回列表</a>
  </div>
  <form class="ts-card ts-rise adm-form" id="entry-form" style="padding:1.6rem">
    ${inner}
    <div class="adm-actions">
      <button class="ts-btn ts-btn-primary" type="submit">保存并提交 git</button>
      <span class="hint" style="font-size:0.78rem;color:var(--text-muted)">保存 = 写入 Markdown 文件 + git commit（不 push）</span>
    </div>
  </form>
`;

// 提交脚本公共前奏：取值助手 + 提交包装
const submitPrelude = (collection, isNew, slug) => `
  const v = (id) => document.getElementById('f-' + id).value.trim();
  const chk = (id) => document.getElementById('f-' + id).checked;
  const el = (id) => document.getElementById('f-' + id);
  const isNew = ${isNew};
  const fixedSlug = ${JSON.stringify(slug ?? '')};
  async function submitEntry(data) {
    const slug = isNew ? v('slug') : fixedSlug;
    if (!slug) { toast('请填写 slug', true); return; }
    const payload = { slug, data, body: el('body').value };
    try {
      if (isNew) await api('/api/content/${collection}', { method: 'POST', body: payload });
      else await api('/api/content/${collection}/' + slug, { method: 'PUT', body: payload });
      toast('已保存并提交');
      setTimeout(() => { location.href = '/content/${collection}'; }, 600);
    } catch (err) { toast(err.message, true); }
  }
`;

export function reviewForm(entry, isNew) {
  const d = entry?.data ?? {};
  const meta = COLLECTIONS.reviews;
  const inner = html`
    <div class="adm-grid-2">
      ${slugField(entry?.slug, isNew)}
      ${textField('title', '标题', d.title)}
      ${textField('tool', '工具名', d.tool)}
      ${textField('category', '分类', d.category, '如：AI 修图 / AI 写作 / AI 编程')}
      ${dateField('date', '日期', d.date)}
      ${textField('rating', '评分（0–10，可空）', d.rating ?? '')}
      ${textField('pricing', '价格（定性）', d.pricing)}
      ${selectField('chinese', '中文支持度', ['优秀', '良好', '一般', '差'], d.chinese ?? '良好')}
      ${textField('link', '官网链接（可空）', d.link ?? '')}
    </div>
    ${textField('dek', '一句话结论 dek', d.dek)}
    <div class="adm-grid-2">
      ${areaField('pros', '优点（每行一条）', (d.pros ?? []).join('\n'))}
      ${areaField('cons', '缺点（每行一条）', (d.cons ?? []).join('\n'))}
    </div>
    ${areaField('bestFor', '适合谁（每行一条）', (d.bestFor ?? []).join('\n'))}
    <div class="adm-checks">
      ${check('freeTier', '有免费额度', d.freeTier)}
      ${check('needsVpn', '需要梯子', d.needsVpn)}
      ${check('sample', '示例内容', d.sample)}
      ${check('draft', '草稿（不发布）', d.draft)}
    </div>
    ${bodyField(entry?.body)}
  `;
  const script = `
    ${submitPrelude('reviews', isNew, entry?.slug)}
    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitEntry({
        title: v('title'), tool: v('tool'), category: v('category'),
        date: v('date'), dek: v('dek'),
        rating: v('rating') === '' ? undefined : Number(v('rating')),
        pricing: v('pricing'),
        freeTier: chk('freeTier'), needsVpn: chk('needsVpn'),
        chinese: v('chinese'),
        pros: linesOf(el('pros')), cons: linesOf(el('cons')), bestFor: linesOf(el('bestFor')),
        link: v('link') || undefined,
        sample: chk('sample'), draft: chk('draft'),
      });
    });
  `;
  return layout({
    title: meta.label,
    active: '/content/reviews',
    body: formShell('reviews', meta, isNew, entry?.slug, inner),
    script,
  });
}

export function comparisonForm(entry, isNew) {
  const d = entry?.data ?? {};
  const meta = COLLECTIONS.comparisons;
  const inner = html`
    <div class="adm-grid-2">
      ${slugField(entry?.slug, isNew)}
      ${textField('title', '标题', d.title)}
      ${textField('category', '分类', d.category)}
      ${dateField('date', '日期', d.date)}
    </div>
    ${textField('dek', '一句话结论 dek', d.dek)}
    <div class="adm-field">
      <label>表格列（key + 显示名）</label>
      <div class="adm-rows" id="cols-editor"></div>
      <div><button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="add-col">+ 加一列</button></div>
      <span class="hint">key 用英文（如 price / chinese），显示名给读者看</span>
    </div>
    <div class="adm-field">
      <label>参评工具（每个工具按列填值）</label>
      <div style="display:grid;gap:0.9rem" id="tools-editor"></div>
      <div><button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="add-tool">+ 加一个工具</button></div>
    </div>
    <div class="adm-checks">
      ${check('sample', '示例内容', d.sample)}
      ${check('draft', '草稿（不发布）', d.draft)}
    </div>
    ${bodyField(entry?.body)}
  `;
  const script = `
    ${submitPrelude('comparisons', isNew, entry?.slug)}
    const columns = ${jsonForScript(d.columns ?? [{ key: '', label: '' }])};
    const tools = ${jsonForScript(d.tools ?? [{ name: '', reviewSlug: '', values: {} }])};

    const colsBox = document.getElementById('cols-editor');
    const toolsBox = document.getElementById('tools-editor');

    function renderCols() {
      rowsEditor(colsBox, columns, (row, col) => {
        row.appendChild(textInput(col.key, 'key（英文）', (val) => { col.key = val; renderTools(); }));
        row.appendChild(textInput(col.label, '显示名', (val) => { col.label = val; renderTools(); }));
      });
    }
    function renderTools() {
      toolsBox.innerHTML = '';
      tools.forEach((tool, i) => {
        const card = document.createElement('div');
        card.className = 'ts-card';
        card.style.padding = '0.9rem';
        const head = document.createElement('div');
        head.className = 'adm-row';
        head.appendChild(textInput(tool.name, '工具名', (val) => { tool.name = val; }));
        head.appendChild(textInput(tool.reviewSlug, '关联测评 slug（可空）', (val) => { tool.reviewSlug = val; }));
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'ts-btn ts-btn-danger ts-btn-sm';
        del.textContent = '删除工具';
        del.onclick = () => { tools.splice(i, 1); renderTools(); };
        head.appendChild(del);
        card.appendChild(head);
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;gap:0.5rem;grid-template-columns:repeat(auto-fill,minmax(11rem,1fr));margin-top:0.6rem';
        columns.filter((c) => c.key).forEach((c) => {
          const wrap = document.createElement('div');
          wrap.className = 'adm-field';
          const lab = document.createElement('label');
          lab.textContent = c.label || c.key;
          wrap.appendChild(lab);
          wrap.appendChild(textInput(tool.values[c.key], '', (val) => { tool.values[c.key] = val; }));
          grid.appendChild(wrap);
        });
        card.appendChild(grid);
        toolsBox.appendChild(card);
      });
    }
    document.getElementById('add-col').onclick = () => { columns.push({ key: '', label: '' }); renderCols(); renderTools(); };
    document.getElementById('add-tool').onclick = () => { tools.push({ name: '', reviewSlug: '', values: {} }); renderTools(); };
    renderCols();
    renderTools();

    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const cols = columns.filter((c) => c.key && c.label);
      const keys = new Set(cols.map((c) => c.key));
      submitEntry({
        title: v('title'), category: v('category'), date: v('date'), dek: v('dek'),
        columns: cols,
        tools: tools
          .filter((t) => t.name)
          .map((t) => ({
            name: t.name,
            reviewSlug: t.reviewSlug || undefined,
            values: Object.fromEntries(Object.entries(t.values).filter(([k, val]) => keys.has(k) && val)),
          })),
        sample: chk('sample'), draft: chk('draft'),
      });
    });
  `;
  return layout({
    title: meta.label,
    active: '/content/comparisons',
    body: formShell('comparisons', meta, isNew, entry?.slug, inner),
    script,
  });
}

export function scenarioForm(entry, isNew) {
  const d = entry?.data ?? {};
  const meta = COLLECTIONS.collections;
  const inner = html`
    <div class="adm-grid-2">
      ${slugField(entry?.slug, isNew)}
      ${textField('title', '标题', d.title)}
      ${textField('scenario', '场景（我要干什么）', d.scenario)}
      ${dateField('date', '日期', d.date)}
    </div>
    ${textField('dek', '一句话结论 dek', d.dek)}
    <div class="adm-field">
      <label>工具链条目（工具 + 角色 + 可选测评 slug）</label>
      <div class="adm-rows" id="items-editor"></div>
      <div><button type="button" class="ts-btn ts-btn-ghost ts-btn-sm" id="add-item">+ 加一条</button></div>
    </div>
    <div class="adm-checks">
      ${check('sample', '示例内容', d.sample)}
      ${check('draft', '草稿（不发布）', d.draft)}
    </div>
    ${bodyField(entry?.body)}
  `;
  const script = `
    ${submitPrelude('collections', isNew, entry?.slug)}
    const items = ${jsonForScript(d.items ?? [{ tool: '', role: '', reviewSlug: '' }])};
    const box = document.getElementById('items-editor');
    function render() {
      rowsEditor(box, items, (row, item) => {
        row.appendChild(textInput(item.tool, '工具', (val) => { item.tool = val; }));
        row.appendChild(textInput(item.role, '在流程里干嘛', (val) => { item.role = val; }));
        row.appendChild(textInput(item.reviewSlug, '测评 slug（可空）', (val) => { item.reviewSlug = val; }));
      });
    }
    document.getElementById('add-item').onclick = () => { items.push({ tool: '', role: '', reviewSlug: '' }); render(); };
    render();
    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitEntry({
        title: v('title'), scenario: v('scenario'), date: v('date'), dek: v('dek'),
        items: items
          .filter((it) => it.tool && it.role)
          .map((it) => ({ tool: it.tool, role: it.role, reviewSlug: it.reviewSlug || undefined })),
        sample: chk('sample'), draft: chk('draft'),
      });
    });
  `;
  return layout({
    title: meta.label,
    active: '/content/collections',
    body: formShell('collections', meta, isNew, entry?.slug, inner),
    script,
  });
}

export function newsForm(entry, isNew) {
  const d = entry?.data ?? {};
  const meta = COLLECTIONS.news;
  const inner = html`
    <div class="adm-grid-2">
      ${slugField(entry?.slug, isNew)}
      ${textField('title', '标题', d.title)}
      ${dateField('date', '日期', d.date)}
      ${selectField('kind', '类型', ['限免', '涨价', '新功能', '跑路预警', '发布', '其它'], d.kind ?? '其它')}
      ${textField('source', '信息来源（可空）', d.source ?? '')}
      ${textField('link', '相关链接（可空）', d.link ?? '')}
    </div>
    ${textField('dek', '一句话说明 dek（可空）', d.dek ?? '')}
    <div class="adm-checks">
      ${check('sample', '示例内容', d.sample)}
      ${check('draft', '草稿（不发布）', d.draft)}
    </div>
    ${bodyField(entry?.body)}
  `;
  const script = `
    ${submitPrelude('news', isNew, entry?.slug)}
    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      submitEntry({
        title: v('title'), date: v('date'), kind: v('kind'),
        dek: v('dek') || undefined,
        source: v('source') || undefined,
        link: v('link') || undefined,
        sample: chk('sample'), draft: chk('draft'),
      });
    });
  `;
  return layout({
    title: meta.label,
    active: '/content/news',
    body: formShell('news', meta, isNew, entry?.slug, inner),
    script,
  });
}

export const FORM_VIEWS = {
  reviews: reviewForm,
  comparisons: comparisonForm,
  collections: scenarioForm,
  news: newsForm,
};
