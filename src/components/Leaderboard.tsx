import { useEffect, useState } from 'react';

// 排行榜直接读盲评 API；生产环境可用 PUBLIC_API_BASE 改成正式接口
const API = (import.meta.env.PUBLIC_API_BASE as string) ?? 'http://localhost:8787';

// 后端返回的是模型聚合行，不是单件作品
type Row = { rank: number; model: string; elo: number; votes: number; works: number };

// 品类 key 要和后端 works.category 保持一致
const CATS: { key: string; label: string }[] = [
  { key: 'image', label: '图像' },
  { key: 'code', label: '代码' },
  { key: 'text', label: '文案' },
];

// 样本量越大可信度越高；这里只做前端展示分层
function confidence(votes: number): { label: string; cls: string } {
  if (votes >= 100) return { label: '高', cls: 'text-good' };
  if (votes >= 30) return { label: '中', cls: 'text-warn' };
  return { label: '低', cls: 'text-muted' };
}

export default function Leaderboard() {
  // category 驱动重新请求；rows 只保存当前品类的聚合结果
  const [category, setCategory] = useState('image');
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    // alive 防止组件卸载后异步回调继续写 state
    let alive = true;
    setStatus('loading');
    fetch(`${API}/api/leaderboard?category=${encodeURIComponent(category)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!alive) return;
        setRows(data.models ?? []);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [category]);

  // 归一化 Elo 条形宽度，避免分数接近时整张表看不出差距
  const maxElo = Math.max(1, ...rows.map((r) => r.elo));
  const minElo = Math.min(...rows.map((r) => r.elo), maxElo - 1);

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-2">
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
      </div>

      {status === 'loading' && <p className="py-20 text-center text-muted">加载排行…</p>}

      {status === 'error' && (
        <div className="ts-card p-8 text-center">
          <p className="font-medium">连不上盲评服务</p>
          <p className="mt-2 text-sm text-muted">本地需先启动后端：<code className="ts-num">pnpm dev:api</code>（或 <code className="ts-num">pnpm dev:all</code>）。</p>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="ts-card p-8 text-center text-muted">该品类暂无数据，去 <a href="/arena" className="text-primary hover:underline">盲评</a> 几对再来看。</div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-subtle text-left">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">模型</th>
                <th className="px-3 py-3 font-medium">Elo 评分</th>
                <th className="px-3 py-3 font-medium">样本量</th>
                <th className="px-3 py-3 font-medium">可信度</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const conf = confidence(r.votes);
                const pct = maxElo === minElo ? 100 : 30 + (70 * (r.elo - minElo)) / (maxElo - minElo);
                return (
                  <tr key={r.model} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="ts-num font-serif text-lg font-semibold">{r.rank}</span>
                    </td>
                    <td className="px-3 py-3 font-medium">{r.model}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="ts-num w-12 font-medium">{r.elo}</span>
                        <span className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle sm:block">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="ts-num px-3 py-3 text-muted">{r.votes}</td>
                    <td className={`px-3 py-3 ${conf.cls}`}>{conf.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        Elo 评分由用户成对盲选实时更新；样本量越大越可信。模型名是聚合结果——盲的是投票过程，不是榜单。
      </p>
    </div>
  );
}
