import { useEffect, useState, useCallback } from 'react';

// 前端通过环境变量连接后端；没配置时使用本地默认端口
const API = (import.meta.env.PUBLIC_API_BASE as string) ?? 'http://localhost:8787';

// 后端只返回盲评所需字段，模型名要等投票后才揭示
type Work = { id: number; mediaUrl: string };
type Pair = { promptId: number; category: string; prompt: string; works: Work[] };
type Revealed = Record<number, { model: string }>;

// 与后端 category 字段保持一致，文案只负责展示
const CATS: { key: string; label: string }[] = [
  { key: 'image', label: '图像' },
  { key: 'code', label: '代码' },
  { key: 'text', label: '文案' },
];

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

// 单个盲评作品卡片：投票前隐藏模型，投票后显示翻牌结果
function WorkCard({
  work,
  picked,
  revealed,
  locked,
  onPick,
}: {
  work: Work;
  picked: boolean;
  revealed?: { model: string };
  locked: boolean;
  onPick: () => void;
}) {
  // 没有真实图片时用作品 id 生成占位色块，便于本地种子数据也能演示
  const isImg = work.mediaUrl?.startsWith('http');
  const hue = (work.id * 53) % 360;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={locked}
      className={[
        'ts-card group relative overflow-hidden text-left transition-all duration-300',
        picked ? 'ring-2 ring-primary' : '',
        locked ? 'cursor-default' : 'hover:-translate-y-1 hover:border-primary',
        revealed && !picked ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex aspect-square items-center justify-center bg-bg-subtle">
        {isImg ? (
          <img src={work.mediaUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-serif text-6xl font-semibold" style={{ color: `oklch(0.62 0.13 ${hue})` }}>
            #{work.id}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
        {revealed ? (
          <>
            <span className="font-medium">{revealed.model}</span>
            {picked && <span className="ts-eyebrow text-primary">你的选择</span>}
          </>
        ) : (
          <span className="text-muted transition-colors group-hover:text-primary">选这个更好 →</span>
        )}
      </div>
    </button>
  );
}

export default function ArenaVote() {
  // 页面状态拆开保存，方便加载、投票、翻牌和错误态分别渲染
  const [category, setCategory] = useState('image');
  const [pair, setPair] = useState<Pair | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'voting' | 'revealed' | 'error' | 'empty'>('loading');
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [count, setCount] = useState(0);

  // 每次切换品类或点下一对时重新拉取匿名作品对子
  const loadPair = useCallback(async (cat: string) => {
    setStatus('loading');
    setRevealed(null);
    setPicked(null);
    try {
      const res = await fetch(`${API}/api/arena/pair?category=${encodeURIComponent(cat)}`);
      if (res.status === 404) return setStatus('empty');
      if (!res.ok) return setStatus('error');
      const data: Pair = await res.json();
      setPair(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadPair(category);
  }, [category, loadPair]);

  // 投票提交赢家和输家，后端校验后返回双方真实模型名
  async function vote(winnerId: number, loserId: number) {
    if (status !== 'ready') return;
    setPicked(winnerId);
    setStatus('voting');
    try {
      const res = await fetch(`${API}/api/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId, loserId, fp: deviceFp() }),
      });
      const data = await res.json();
      if (data.revealed) {
        setRevealed(data.revealed);
        setStatus('revealed');
        setCount((n) => n + 1);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
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
            onClick={() => setCategory(cat.key)}
            className={[
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              category === cat.key ? 'border-primary bg-primary text-primary-contrast' : 'border-border text-muted hover:border-primary hover:text-primary',
            ].join(' ')}
          >
            {cat.label}
          </button>
        ))}
        <span className="ts-eyebrow ml-auto text-muted">本次已评 <span className="ts-num">{count}</span> 对</span>
      </div>

      {status === 'loading' && (
        <div className="flex min-h-[34rem] items-center justify-center text-muted">加载一对作品…</div>
      )}

      {status === 'error' && (
        <div className="ts-card p-8 text-center">
          <p className="font-medium">连不上盲评服务</p>
          <p className="mt-2 text-sm text-muted">本地需先启动后端：<code className="ts-num">pnpm dev:api</code>（或 <code className="ts-num">pnpm dev:all</code> 一起起）。</p>
        </div>
      )}

      {status === 'empty' && (
        <div className="ts-card p-8 text-center text-muted">该品类暂无可对比的作品。</div>
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
                  revealed={revealed?.[w.id]}
                  locked={status !== 'ready'}
                  onPick={() => vote(w.id, other.id)}
                />
              );
            })}
          </div>

          <div className="mt-7 flex items-center justify-center gap-4">
            {status === 'revealed' ? (
              <button type="button" onClick={() => loadPair(category)} className="ts-btn ts-btn-primary">
                下一对
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            ) : (
              <p className="text-sm text-muted">{status === 'voting' ? '记录中…' : '点上面任意一件，选你觉得更好的'}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
