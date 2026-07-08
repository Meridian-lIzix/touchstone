import { useEffect, useState } from 'react';

const apiBase = () => {
  const configured = (import.meta.env.PUBLIC_API_BASE as string | undefined)?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://127.0.0.1:8787';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return window.location.origin;
};

type Row = {
  rank: number;
  model: string;
  verification?: string;
  elo: number;
  votes: number;
  works: number;
  coverUrl?: string | null;
};

const numberFormat = new Intl.NumberFormat('zh-CN');
const mediaVersion = '20260707-home-ranking';

function formatNumber(value: number) {
  return numberFormat.format(value || 0);
}

function resolveMediaUrl(url?: string | null) {
  if (!url || url === 'placeholder') return null;
  const resolved = url.startsWith('/') ? `${apiBase()}${url}` : url;
  if (!url.startsWith('/media/')) return resolved;
  return `${resolved}${resolved.includes('?') ? '&' : '?'}v=${mediaVersion}`;
}

function RankingCard({ row, index }: { row: Row; index: number }) {
  const coverUrl = resolveMediaUrl(row.coverUrl);

  return (
    <a
      href="/leaderboard"
      className="ts-card group block overflow-hidden p-5 transition-transform duration-300 hover:-translate-y-1 ts-rise"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="ts-num font-serif text-4xl font-semibold leading-none">{row.rank}</span>
        <span className="ts-num rounded-md bg-bg-subtle px-2 py-1 text-sm font-medium text-primary">{row.elo}</span>
      </div>
      <div className="mt-4 aspect-[4/3] overflow-hidden rounded-lg bg-bg-subtle">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-muted">{row.model}</div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{row.model}</span>
        <span className="shrink-0 text-muted">盲评样本 <span className="ts-num">{formatNumber(row.votes)}</span></span>
      </div>
      <p className="mt-1 text-xs text-muted">{formatNumber(row.works)} 件作品参与统计</p>
    </a>
  );
}

export default function HomeRanking() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch(`${apiBase()}/api/leaderboard?category=image`, { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setRows((data.models ?? []).slice(0, 3));
        setStatus('ready');
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, []);

  if (status === 'loading') {
    return <div className="mt-8 rounded-lg border border-border bg-bg-subtle px-5 py-12 text-center text-sm text-muted">加载榜单…</div>;
  }

  if (status === 'error') {
    return <div className="mt-8 rounded-lg border border-border bg-bg-subtle px-5 py-12 text-center text-sm text-muted">暂时连不上 Arena 数据</div>;
  }

  if (rows.length === 0) {
    return <div className="mt-8 rounded-lg border border-border bg-bg-subtle px-5 py-12 text-center text-sm text-muted">暂无图像榜单数据</div>;
  }

  return (
    <div className="mt-8 grid gap-5 md:grid-cols-3">
      {rows.map((row, index) => (
        <RankingCard key={`${row.rank}-${row.model}`} row={row} index={index} />
      ))}
    </div>
  );
}
