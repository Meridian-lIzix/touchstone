import { useEffect, useMemo, useRef, useState, useCallback } from 'react';

const apiBase = () => {
  const configured = (import.meta.env.PUBLIC_API_BASE as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://127.0.0.1:8787';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return window.location.origin;
};

type Work = {
  id: number;
  mediaUrl: string;
  contentType: 'image' | 'code' | 'text';
  language: string | null;
  previewText: string | null;
};
type Pair = { promptId: number; category: string; prompt: string; pairToken: string; works: Work[] };
type VoteModels = Record<number, { model: string }>;
type VoteStat = { model: string; votes: number };

// 与后端 category 字段保持一致，文案只负责展示
const CATS: { key: string; label: string }[] = [
  { key: 'image', label: '图像' },
  { key: 'code', label: '代码' },
  { key: 'text', label: '文案' },
];

const mediaVersion = '20260707-watermark-lowdist';
const resolveUrl = (url: string) => {
  const resolved = url?.startsWith('/') ? `${apiBase()}${url}` : url;
  if (!url?.startsWith('/media/')) return resolved;
  return `${resolved}${resolved.includes('?') ? '&' : '?'}v=${mediaVersion}`;
};

function addVoteStat(stats: VoteStat[], model: string) {
  const existing = stats.find((stat) => stat.model === model);
  if (existing) {
    return stats.map((stat) => (stat.model === model ? { ...stat, votes: stat.votes + 1 } : stat));
  }
  return [...stats, { model, votes: 1 }];
}

const CODE_SHELL_STYLE = `
  html, body { margin: 0; min-height: 100%; background: #ffffff; color: #1f2937; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  * { box-sizing: border-box; }
  body { padding: 24px; }
  .ts-preview-stage { min-height: calc(100vh - 48px); display: grid; place-items: center; background: #ffffff; }
  .ts-preview-sample { width: min(520px, 100%); border: 1px solid var(--border-color, var(--color-border, #e5e7eb)); border-radius: 16px; background: var(--card-bg, var(--bg-secondary, var(--color-card-bg, #ffffff))); color: var(--text-primary, var(--text-color, var(--color-text, #1f2937))); box-shadow: 0 16px 40px var(--shadow-color, var(--color-shadow, rgba(15, 23, 42, 0.08))); padding: 24px; }
  .ts-preview-kicker { margin: 0 0 8px; color: var(--text-secondary, var(--color-text-secondary, #6b7280)); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  .ts-preview-title { margin: 0; font-size: 28px; line-height: 1.15; }
  .ts-preview-text { margin: 12px 0 18px; color: var(--text-secondary, var(--color-text-secondary, #4b5563)); line-height: 1.7; }
  .ts-preview-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .ts-preview-button { border: 0; border-radius: 999px; background: var(--primary-color, var(--accent-color, var(--color-primary, #2563eb))); color: #ffffff; padding: 10px 16px; font: inherit; }
  .ts-preview-chip { border: 1px solid var(--border-color, var(--color-border, #e5e7eb)); border-radius: 999px; padding: 8px 12px; color: var(--text-secondary, var(--color-text-secondary, #6b7280)); }
  .ts-demo-panel { width: min(560px, 100%); border: 1px solid #e5e7eb; border-radius: 18px; background: #ffffff; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.1); padding: 22px; }
  .ts-demo-label { margin: 0 0 12px; color: #64748b; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
  .ts-demo-select { border: 1px solid #d1d5db; border-radius: 12px; padding: 12px; }
  .ts-demo-select-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .ts-demo-tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .ts-demo-tag { border-radius: 999px; background: #eef2ff; color: #4338ca; padding: 7px 10px; font-size: 13px; }
  .ts-demo-menu { margin-top: 10px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
  .ts-demo-option { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
  .ts-demo-search { display: flex; align-items: center; gap: 10px; border: 1px solid #d1d5db; border-radius: 999px; padding: 11px 14px; }
  .ts-demo-search input { border: 0; outline: 0; flex: 1; min-width: 0; font: inherit; }
  .ts-demo-results { margin-top: 14px; display: grid; gap: 8px; }
  .ts-demo-result { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; }
  .ts-demo-filter { display: flex; flex-wrap: wrap; gap: 9px; }
  .ts-demo-filter span { border: 1px solid #d1d5db; border-radius: 999px; padding: 8px 12px; }
  .ts-demo-filter span:nth-child(-n+2) { border-color: #2563eb; background: #dbeafe; color: #1d4ed8; }
  .ts-demo-toast { display: grid; gap: 10px; }
  .ts-demo-toast-item { border-radius: 14px; border: 1px solid #bbf7d0; background: #f0fdf4; color: #166534; padding: 12px 14px; }
  .ts-demo-toast-item:nth-child(2) { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
  .ts-demo-pages { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ts-demo-page { min-width: 36px; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 11px; text-align: center; }
  .ts-demo-page-active { border-color: #2563eb; background: #2563eb; color: #ffffff; }
`;

const MODEL_LEAK_LINE = /^(?:(?:腾讯混元|文心一言|智谱清言)(?:[-_\s]*(?:[A-Za-z0-9.]+))*|(?:deepseek|doubao|qwen|kimi|glm|hunyuan|ernie)(?:[-_\s]*(?:[A-Za-z0-9.]+))+)\s*$/i;

function stripModelLeak(source: string) {
  return source
    .split(/\r?\n/)
    .filter((line) => !MODEL_LEAK_LINE.test(line.trim()))
    .join('\n')
    .trim();
}

function stripCodeEnvelope(source: string) {
  return stripModelLeak(source)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```[\w-]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
    .replace(/^(html|css|javascript|js|typescript|ts|tsx|jsx)\s*\n/i, '')
    .trim();
}

function cssFixtureBody(code: string) {
  if (/:root|data-theme|--[A-Za-z0-9_-]+/.test(code)) {
    return `<section class="ts-preview-sample"><p class="ts-preview-kicker">Preview</p><h1 class="ts-preview-title">Theme Sample</h1><p class="ts-preview-text">The same white shell renders each submitted CSS token set.</p><div class="ts-preview-row"><button class="button btn ts-preview-button">Primary</button><span class="ts-preview-chip">Token</span></div></section>`;
  }
  if (/\.(?:card-grid|card-container|container)\b/.test(code) && /\.card\b/.test(code) && /grid-template-columns|display\s*:\s*grid|repeat\(\s*3|@media/i.test(code)) {
    return `<section class="card-grid card-container container"><article class="card"><div class="card-image"></div><h3 class="card-title">卡片标题 1</h3><p class="card-description">这是卡片的描述内容，展示响应式布局效果。</p></article><article class="card"><div class="card-image"></div><h3 class="card-title">卡片标题 2</h3><p class="card-description">这是卡片的描述内容，展示响应式布局效果。</p></article><article class="card"><div class="card-image"></div><h3 class="card-title">卡片标题 3</h3><p class="card-description">这是卡片的描述内容，展示响应式布局效果。</p></article></section>`;
  }
  return null;
}

function codeRenderDoc(source: string | null) {
  if (!source) return null;
  const code = stripCodeEnvelope(source);
  const hasFullHtml = /<!doctype\s+html|<html\b|<body\b/i.test(code);
  const startsLikeCode = /^(import|export|function|const|let|var|interface|type|class)\b/i.test(code);
  const hasCodeSignals = startsLikeCode || /=>|return\b|useState\b|React\b/.test(code);
  const hasHtmlFragment = /<\/?(?:style|main|section|article|div|span|button|form|input|label|ul|ol|li|nav|header|footer|h[1-6]|p|a|table|thead|tbody|tr|td|th)\b/i.test(code) && !hasCodeSignals;
  const looksLikeCss = /\{[\s\S]*:[\s\S]*;?[\s\S]*\}/.test(code) && !hasCodeSignals;
  const base = `<style>${CODE_SHELL_STYLE}</style>`;

  if (hasFullHtml) {
    if (/<\/head>/i.test(code)) return code.replace(/<\/head>/i, `${base}</head>`);
    return `${base}${code}`;
  }

  if (hasHtmlFragment) {
    return `<!doctype html><html><head><meta charset="utf-8" />${base}</head><body><div class="ts-preview-stage">${code}</div></body></html>`;
  }

  if (looksLikeCss) {
    const fixture = cssFixtureBody(code);
    if (fixture) return `<!doctype html><html><head><meta charset="utf-8" />${base}<style>${code}</style></head><body><main class="ts-preview-stage">${fixture}</main></body></html>`;
  }

  return null;
}

function CodeFrame({ doc, compact }: { doc: string; compact?: boolean }) {
  const sandbox = doc.includes('data-touchstone-react-preview') ? 'allow-scripts' : '';
  return (
    <iframe
      title="代码渲染预览"
      srcDoc={doc}
      sandbox={sandbox}
      referrerPolicy="no-referrer"
      className={compact ? 'pointer-events-none h-full w-full border-0 bg-white' : 'h-[72vh] min-h-[28rem] w-full border-0 bg-white'}
    />
  );
}

async function loadCodePreviewDoc(work: Work) {
  if (work.contentType !== 'code') return null;
  try {
    const res = await fetch(`${apiBase()}/api/code-preview/${work.id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data: { doc?: string } = await res.json();
    return typeof data.doc === 'string' ? data.doc : null;
  } catch {
    return null;
  }
}

// 轻量设备指纹用于同设备同对子去重；失败时退回匿名值
function deviceFp(): string {
  try {
    let id = localStorage.getItem('ts-fp');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ts-fp', id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

// 全屏预览图标：放在卡片右上角，点击不触发投票
function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 单个盲评作品卡片：按内容类型渲染预览，投票走独立按钮，点卡片打开全屏预览
function WorkCard({
  work,
  picked,
  locked,
  codeSource,
  previewDoc,
  onPick,
  onExpand,
}: {
  work: Work;
  picked: boolean;
  locked: boolean;
  codeSource?: string | null;
  previewDoc?: string | null;
  onPick: () => void;
  onExpand: () => void;
}) {
  // 没有真实媒体时用作品 id 生成占位色块，便于本地占位数据也能演示
  const isPlaceholder = !work.mediaUrl || work.mediaUrl === 'placeholder';
  const hue = (work.id * 53) % 360;
  const codeText = codeSource ?? work.previewText ?? '';
  const sanitizedCodeText = stripModelLeak(codeText);
  const renderDoc = useMemo(() => (work.contentType === 'code' ? previewDoc || codeRenderDoc(codeText || null) : null), [codeText, previewDoc, work.contentType]);
  return (
    <div
      className={[
        'ts-card group relative overflow-hidden text-left transition-all duration-300',
        picked ? 'ring-2 ring-primary' : '',
        locked ? '' : 'hover:-translate-y-1 hover:border-primary',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onExpand}
        title="全屏预览"
        aria-label="全屏预览"
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg/85 text-muted backdrop-blur transition-colors hover:border-primary hover:text-primary"
      >
        <ExpandIcon />
      </button>

      <button
        type="button"
        onClick={onExpand}
        aria-label="打开预览"
        className="block w-full cursor-zoom-in text-left"
      >
        {work.contentType === 'image' ? (
          <div className="flex aspect-square items-center justify-center bg-bg-subtle">
            {isPlaceholder ? (
              <span className="font-serif text-6xl font-semibold" style={{ color: `oklch(0.62 0.13 ${hue})` }}>
                #{work.id}
              </span>
            ) : (
              <img src={resolveUrl(work.mediaUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
        ) : work.contentType === 'code' ? (
          <div className="relative aspect-square overflow-hidden bg-bg-subtle">
            {renderDoc ? (
              <CodeFrame doc={renderDoc} compact />
            ) : (
              <>
                <pre className="ts-num h-full overflow-hidden whitespace-pre-wrap break-words p-4 text-[11.5px] leading-relaxed text-text/90">
                  {sanitizedCodeText || '（代码内容较长，点开全屏查看）'}
                </pre>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-subtle to-transparent" />
              </>
            )}
            {work.language && (
              <span className="ts-eyebrow absolute bottom-3 left-4 text-muted">{work.language}</span>
            )}
          </div>
        ) : (
          <div className="relative aspect-square overflow-hidden bg-bg-subtle">
            <p className="h-full overflow-hidden whitespace-pre-wrap p-5 font-serif text-[15px] leading-loose text-text/90">
              {work.previewText || '（文案内容较长，点开全屏查看）'}
            </p>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-subtle to-transparent" />
          </div>
        )}
      </button>

      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
        <span className="text-muted">点卡片可预览</span>
        <button
          type="button"
          onClick={onPick}
          disabled={locked}
          className="ts-btn ts-btn-primary ts-btn-sm disabled:opacity-50"
        >
          选这个更好 →
        </button>
      </div>
    </div>
  );
}

// 全屏预览：图片直接放大，代码/文案拉取完整文件；任何情况下都不显示模型名
function PreviewModal({
  work,
  content,
  previewDoc,
  loading,
  onClose,
}: {
  work: Work;
  content: string | null;
  previewDoc?: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'preview' | 'source'>('source');
  const displayContent = useMemo(
    () => (work.contentType === 'code' && content ? stripModelLeak(content) : content),
    [content, work.contentType],
  );
  const renderDoc = useMemo(() => (work.contentType === 'code' ? previewDoc || codeRenderDoc(displayContent) : null), [displayContent, previewDoc, work.contentType]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (work.contentType === 'code') setView(renderDoc ? 'preview' : 'source');
  }, [renderDoc, work.contentType, work.id]);

  async function copy() {
    if (!displayContent) return;
    try {
      await navigator.clipboard.writeText(displayContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="作品全屏预览"
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <span className="ts-eyebrow text-muted">
            匿名作品 · {work.contentType === 'image' ? '图像' : work.contentType === 'code' ? `代码${work.language ? ` · ${work.language}` : ''}` : '文案'}
          </span>
          <div className="flex items-center gap-2">
            {work.contentType === 'code' && (
              <>
                {renderDoc && (
                  <button type="button" onClick={() => setView((v) => (v === 'preview' ? 'source' : 'preview'))} className="ts-btn ts-btn-ghost ts-btn-sm">
                    {view === 'preview' ? 'Source' : 'Preview'}
                  </button>
                )}
                {view === 'source' && (
                  <button type="button" onClick={() => setWrap((v) => !v)} className="ts-btn ts-btn-ghost ts-btn-sm">
                    {wrap ? '横向滚动' : '自动换行'}
                  </button>
                )}
                <button type="button" onClick={copy} className="ts-btn ts-btn-ghost ts-btn-sm" disabled={!content}>
                  {copied ? '已复制' : '复制代码'}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="ts-btn ts-btn-primary ts-btn-sm">
              返回选择
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {work.contentType === 'image' ? (
            <div className="flex h-full min-h-[50vh] items-center justify-center bg-bg-subtle p-4">
              <img src={resolveUrl(work.mediaUrl)} alt="" className="max-h-[76vh] max-w-full object-contain" />
            </div>
          ) : loading ? (
            <div className="flex min-h-[40vh] items-center justify-center text-muted">加载完整内容…</div>
          ) : work.contentType === 'code' && renderDoc && view === 'preview' ? (
            <CodeFrame doc={renderDoc} />
          ) : work.contentType === 'code' ? (
            <pre
              className={[
                'ts-num min-h-[40vh] p-5 text-[13px] leading-relaxed text-text',
                wrap ? 'whitespace-pre-wrap break-words' : 'overflow-x-auto whitespace-pre',
              ].join(' ')}
            >
              {displayContent ?? '内容加载失败，请重试'}
            </pre>
          ) : (
            <article className="mx-auto min-h-[40vh] max-w-2xl whitespace-pre-wrap p-6 font-serif text-[16.5px] leading-loose text-text">
              {displayContent ?? '内容加载失败，请重试'}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionStats({
  stats,
  total,
  onBack,
}: {
  stats: VoteStat[];
  total: number;
  onBack: () => void;
}) {
  return (
    <div className="ts-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <span className="ts-eyebrow text-muted">本次投票统计</span>
          <h2 className="mt-1 font-serif text-2xl font-semibold">已投 <span className="ts-num">{total}</span> 对</h2>
        </div>
        <button type="button" onClick={onBack} className="ts-btn ts-btn-primary ts-btn-sm">
          返回盲评
        </button>
      </div>

      {stats.length ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-left text-muted">
                <th className="px-5 py-3 font-medium">模型</th>
                <th className="px-5 py-3 text-right font-medium">投票次数</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.model} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-medium">{stat.model}</td>
                  <td className="ts-num px-5 py-3 text-right">{stat.votes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-5 py-8 text-sm text-muted">本次还没有投票</div>
      )}
    </div>
  );
}

export default function ArenaVote() {
  const [category, setCategory] = useState('image');
  const [isProfessionalUser, setIsProfessionalUser] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'voting' | 'error' | 'empty'>('loading');
  const [picked, setPicked] = useState<number | null>(null);
  const [voteStats, setVoteStats] = useState<VoteStat[]>([]);
  const [showSessionStats, setShowSessionStats] = useState(false);
  const [expanded, setExpanded] = useState<Work | null>(null);
  const [fullContent, setFullContent] = useState<Record<number, string>>({});
  const [previewDocs, setPreviewDocs] = useState<Record<number, string>>({});
  const [contentLoading, setContentLoading] = useState(false);
  // setStatus 是异步生效的，双击场景要靠同步 ref 挡住第二次提交
  const votingRef = useRef(false);
  const totalVotes = useMemo(() => voteStats.reduce((sum, stat) => sum + stat.votes, 0), [voteStats]);
  const sortedVoteStats = useMemo(() => [...voteStats].sort((a, b) => b.votes - a.votes || a.model.localeCompare(b.model)), [voteStats]);

  // 每次切换品类或重新出题时拉取匿名作品对子
  const loadPair = useCallback(async (cat: string) => {
    setStatus('loading');
    setPicked(null);
    setExpanded(null);
    setShowSessionStats(false);
    try {
      const visualOnly = cat === 'code' && !isProfessionalUser;
      const attempts = visualOnly ? 16 : 1;
      const loadWorkText = async (work: Work) => {
        try {
          const res = await fetch(resolveUrl(work.mediaUrl), { cache: 'no-store' });
          const text = res.ok ? await res.text() : '';
          return text || work.previewText || '';
        } catch {
          return work.previewText || '';
        }
      };
      const loadRenderable = async (work: Work) => {
        const text = await loadWorkText(work);
        const doc = codeRenderDoc(text) || await loadCodePreviewDoc(work);
        return { id: work.id, text, doc };
      };

      for (let attempt = 0; attempt < attempts; attempt++) {
        const params = new URLSearchParams({ category: cat });
        const fp = deviceFp();
        if (fp !== 'anon') params.set('fp', fp);
        if (visualOnly) params.set('visualOnly', '1');
        const res = await fetch(`${apiBase()}/api/arena/pair?${params.toString()}`, { cache: 'no-store', credentials: 'include' });
        if (res.status === 404) return setStatus('empty');
        if (!res.ok) return setStatus('error');
        const data: Pair = await res.json();

        if (visualOnly) {
          const entries = await Promise.all(data.works.map(loadRenderable));
          if (!entries.every((entry) => entry.doc)) continue;
          setFullContent((current) => {
            const next = { ...current };
            for (const entry of entries) next[entry.id] = entry.text;
            return next;
          });
          setPreviewDocs((current) => {
            const next = { ...current };
            for (const entry of entries) {
              if (entry.doc) next[entry.id] = entry.doc;
            }
            return next;
          });
        }

        setPair(data);
        setStatus('ready');
        return;
      }

      setPair(null);
      setStatus('empty');
    } catch {
      setStatus('error');
    }
  }, [isProfessionalUser]);

  useEffect(() => {
    loadPair(category);
  }, [category, loadPair]);

  useEffect(() => {
    const works = pair?.works.filter((w) => w.contentType === 'code' && w.mediaUrl && w.mediaUrl !== 'placeholder') ?? [];
    if (!works.length) return;

    let cancelled = false;
    Promise.all(
      works.map(async (work) => {
        try {
          const res = await fetch(resolveUrl(work.mediaUrl));
          const text = res.ok ? await res.text() : '';
          const content = text || work.previewText || '';
          const doc = codeRenderDoc(content) || await loadCodePreviewDoc(work);
          return { id: work.id, text: content, doc };
        } catch {
          const content = work.previewText || '';
          const doc = codeRenderDoc(content) || await loadCodePreviewDoc(work);
          return { id: work.id, text: content, doc };
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setFullContent((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (next[entry.id] == null) next[entry.id] = entry.text;
        }
        return next;
      });
      setPreviewDocs((current) => {
        const next = { ...current };
        for (const entry of entries) {
          if (entry.doc && next[entry.id] == null) next[entry.id] = entry.doc;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pair]);

  // 打开全屏预览；代码/文案首次打开时拉取完整文件内容
  const openPreview = useCallback(
    async (work: Work) => {
      setExpanded(work);
      if (work.contentType === 'image') return;
      if (work.contentType === 'code' && previewDocs[work.id] == null) {
        const doc = codeRenderDoc(fullContent[work.id] ?? work.previewText ?? '') || await loadCodePreviewDoc(work);
        if (doc) setPreviewDocs((m) => ({ ...m, [work.id]: doc }));
      }
      if (fullContent[work.id] != null) return;
      setContentLoading(true);
      try {
        const res = await fetch(resolveUrl(work.mediaUrl));
        const text = res.ok ? await res.text() : '';
        const content = text || work.previewText || '';
        setFullContent((m) => ({ ...m, [work.id]: content }));
        if (work.contentType === 'code') {
          const doc = codeRenderDoc(content) || await loadCodePreviewDoc(work);
          if (doc) setPreviewDocs((m) => ({ ...m, [work.id]: doc }));
        }
      } catch {
        setFullContent((m) => ({ ...m, [work.id]: work.previewText || '' }));
      } finally {
        setContentLoading(false);
      }
    },
    [fullContent, previewDocs],
  );

  async function vote(winnerId: number, loserId: number) {
    if (votingRef.current || status !== 'ready') return;
    votingRef.current = true;
    setPicked(winnerId);
    setStatus('voting');
    try {
      const fp = deviceFp();
      const res = await fetch(`${apiBase()}/api/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId, loserId, fp: fp === 'anon' ? null : fp, pairToken: pair?.pairToken }),
      });
      const data: { revealed?: VoteModels; counted?: boolean; deduped?: boolean } = await res.json();
      const winnerModel = data.revealed?.[winnerId]?.model;
      if (winnerModel) {
        if (data.counted !== false && !data.deduped) setVoteStats((stats) => addVoteStat(stats, winnerModel));
        await loadPair(category);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      votingRef.current = false;
    }
  }

  return (
    <div>
      {/* 品类切换 */}
      <div className="mb-8 flex flex-wrap items-center gap-2">
        {CATS.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => {
              setCategory(cat.key);
              setShowSessionStats(false);
            }}
            className={[
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              category === cat.key ? 'border-primary bg-primary text-primary-contrast' : 'border-border text-muted hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
        {category === 'code' && (
          <label className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:border-primary hover:text-primary">
            <input
              type="checkbox"
              checked={isProfessionalUser}
              onChange={(event) => setIsProfessionalUser(event.currentTarget.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span>我是专业用户</span>
          </label>
        )}
        <button
          type="button"
          onClick={() => setShowSessionStats(true)}
          className="ts-eyebrow ml-auto text-left text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          本次已评 <span className="ts-num">{totalVotes}</span> 对
        </button>
      </div>

      {showSessionStats ? (
        <SessionStats stats={sortedVoteStats} total={totalVotes} onBack={() => setShowSessionStats(false)} />
      ) : (
        <>
      {status === 'loading' && (
        <div className="flex min-h-[34rem] items-center justify-center text-muted">加载一对作品…</div>
      )}

      {status === 'error' && (
        <div className="ts-card p-8 text-center">
          <p className="font-medium">连不上盲评服务</p>
          <p className="mt-2 text-sm text-muted">本地需先启动后端：<code className="ts-num">pnpm dev:api</code>（或 <code className="ts-num">pnpm dev:all</code> 一起起）</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="ts-card p-8 text-center text-muted">该品类暂无可对比的作品</div>
      )}

      {pair && status !== 'loading' && status !== 'error' && status !== 'empty' && (
        <>
          <div className="mb-6 rounded-xl border border-border bg-bg-subtle p-4">
            <span className="ts-eyebrow text-muted">同一句提示词</span>
            <p className="mt-1 font-serif text-lg">{pair.prompt}</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {pair.works.map((w) => {
              const other = pair.works.find((x) => x.id !== w.id)!;
              return (
                <WorkCard
                  key={w.id}
                  work={w}
                  picked={picked === w.id}
                  locked={status !== 'ready'}
                  codeSource={fullContent[w.id] ?? null}
                  previewDoc={previewDocs[w.id] ?? null}
                  onPick={() => vote(w.id, other.id)}
                  onExpand={() => openPreview(w)}
                />
              );
            })}
          </div>

          <div className="mt-7 flex items-center justify-center gap-4">
            <p className="text-sm text-muted">{status === 'voting' ? '记录中…' : '点卡片全屏预览，用卡片下方按钮投票'}</p>
          </div>
        </>
      )}
        </>
      )}

      {expanded && (
        <PreviewModal
          work={expanded}
          content={fullContent[expanded.id] ?? null}
          previewDoc={previewDocs[expanded.id] ?? null}
          loading={contentLoading && fullContent[expanded.id] == null}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}
