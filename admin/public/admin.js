// 后台共享前端工具：主题切换 + fetch 包装 + toast + 动态行编辑器
(() => {
  const applyTheme = () => {
    try {
      const t = localStorage.getItem('ts-theme');
      if (t === 'dark' || t === 'light') {
        document.documentElement.setAttribute('data-theme', t);
        document.documentElement.style.colorScheme = t;
      }
    } catch (e) {}
  };
  applyTheme();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('ts-theme', next); } catch (e2) {}
    applyTheme();
  });
})();

function toast(msg, isErr) {
  let el = document.querySelector('.adm-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'adm-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('err', Boolean(isErr));
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), isErr ? 5000 : 2600);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('未登录');
  }
  if (!res.ok) {
    const detail = data && data.details ? `：${data.details.join('；')}` : '';
    throw new Error(((data && data.error) || `请求失败（${res.status}）`) + detail);
  }
  return data;
}

// FormData 上传要让浏览器自己带 multipart 边界，不能手动设 content-type
async function apiUpload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `上传失败（${res.status}）`);
  return data;
}

// 通用动态行：rows = 数据数组，render(row, update) 返回一行内部的 DOM
function rowsEditor(container, rows, render, onChange) {
  const rerender = () => {
    container.innerHTML = '';
    rows.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'adm-row';
      render(div, row, () => onChange && onChange());
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'ts-btn ts-btn-danger ts-btn-sm';
      del.textContent = '删除';
      del.onclick = () => {
        rows.splice(i, 1);
        rerender();
        onChange && onChange();
      };
      div.appendChild(del);
      container.appendChild(div);
    });
  };
  rerender();
  return { rerender };
}

function textInput(value, placeholder, onInput) {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value || '';
  el.placeholder = placeholder || '';
  el.addEventListener('input', () => onInput(el.value));
  return el;
}

function linesOf(textarea) {
  return textarea.value.split('\n').map((s) => s.trim()).filter(Boolean);
}
