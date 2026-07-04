// Arena 管理视图：prompt 列表 + 单个 prompt 的作品管理（含本地上传）
import { html } from 'hono/html';
import { layout, jsonForScript } from './layout.mjs';

const CATEGORY_HINT = '已有品类：image / code / text，可自定义新品类';

export function arenaPage(prompts) {
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

    <section class="ts-card ts-rise" style="overflow:hidden;animation-delay:90ms">
      <table class="adm-table">
        <thead>
          <tr><th style="width:3.5rem">ID</th><th style="width:6rem">品类</th><th>Prompt</th><th style="width:5.5rem">作品数</th><th style="width:9rem"></th></tr>
        </thead>
        <tbody>
          ${prompts.length === 0
            ? html`<tr><td colspan="5" style="color:var(--text-muted)">还没有 prompt。</td></tr>`
            : prompts.map(
                (p) => html`<tr>
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
        </tbody>
      </table>
    </section>
  `;
  const script = `
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
    <div class="adm-page-head">
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
          <tr><th style="width:3.5rem">ID</th><th style="width:6rem">媒体</th><th>模型标签 / 媒体 URL</th><th style="width:6rem">Elo</th><th style="width:5rem">票数</th><th style="width:9rem"></th></tr>
        </thead>
        <tbody id="works-body"></tbody>
      </table>
    </section>
  `;
  const script = `
    const promptId = ${prompt.id};
    const works = ${jsonForScript(works)};
    const tbody = document.getElementById('works-body');

    const isImg = (u) => /\\.(png|jpe?g|webp|gif|svg)($|\\?)/i.test(u || '');
    function mediaThumb(url) {
      if (url && url.startsWith('http') && isImg(url)) {
        const img = document.createElement('img');
        img.className = 'adm-media-preview';
        img.src = url;
        img.alt = '';
        return img;
      }
      const span = document.createElement('span');
      span.className = 'adm-badge';
      span.textContent = url === 'placeholder' ? '占位' : '非图片';
      return span;
    }

    function renderWorks() {
      tbody.innerHTML = '';
      if (works.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-muted)">该 prompt 下还没有作品。盲评配对需要至少 2 件。</td></tr>';
        return;
      }
      works.forEach((w) => {
        const tr = document.createElement('tr');
        const tdId = document.createElement('td');
        tdId.className = 'ts-num';
        tdId.textContent = w.id;
        const tdThumb = document.createElement('td');
        tdThumb.appendChild(mediaThumb(w.media_url));
        const tdEdit = document.createElement('td');
        const modelIn = textInput(w.model_label, '模型标签', (val) => { w.model_label = val; });
        const mediaIn = textInput(w.media_url, '媒体 URL', (val) => { w.media_url = val; });
        mediaIn.style.marginTop = '0.35rem';
        mediaIn.classList.add('ts-num');
        mediaIn.style.fontSize = '0.78rem';
        tdEdit.appendChild(modelIn);
        tdEdit.appendChild(mediaIn);
        const upLabel = document.createElement('label');
        upLabel.className = 'ts-btn ts-btn-ghost ts-btn-sm';
        upLabel.style.marginTop = '0.35rem';
        upLabel.textContent = '上传替换';
        const upInput = document.createElement('input');
        upInput.type = 'file';
        upInput.hidden = true;
        upInput.onchange = async () => {
          if (!upInput.files[0]) return;
          try {
            const r = await apiUpload(upInput.files[0]);
            w.media_url = r.url;
            mediaIn.value = r.url;
            toast('已上传，记得点保存');
          } catch (err) { toast(err.message, true); }
        };
        upLabel.appendChild(upInput);
        tdEdit.appendChild(upLabel);
        const tdElo = document.createElement('td');
        tdElo.className = 'ts-num';
        tdElo.textContent = Math.round(w.elo);
        const tdVotes = document.createElement('td');
        tdVotes.className = 'ts-num';
        tdVotes.textContent = w.vote_count;
        const tdAct = document.createElement('td');
        tdAct.style.cssText = 'text-align:right;white-space:nowrap';
        const save = document.createElement('button');
        save.className = 'ts-btn ts-btn-ghost ts-btn-sm';
        save.textContent = '保存';
        save.onclick = async () => {
          try {
            await api('/api/arena/works/' + w.id, {
              method: 'PUT',
              body: { modelLabel: w.model_label, mediaUrl: w.media_url },
            });
            toast('已保存');
            setTimeout(() => location.reload(), 400);
          } catch (err) { toast(err.message, true); }
        };
        const del = document.createElement('button');
        del.className = 'ts-btn ts-btn-danger ts-btn-sm';
        del.textContent = '删除';
        del.onclick = async () => {
          if (!confirm('删除该作品会连同相关投票一起删除，确认？')) return;
          try {
            await api('/api/arena/works/' + w.id, { method: 'DELETE' });
            toast('已删除');
            setTimeout(() => location.reload(), 400);
          } catch (err) { toast(err.message, true); }
        };
        tdAct.appendChild(save);
        tdAct.appendChild(document.createTextNode(' '));
        tdAct.appendChild(del);
        tr.append(tdId, tdThumb, tdEdit, tdElo, tdVotes, tdAct);
        tbody.appendChild(tr);
      });
    }
    renderWorks();

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
