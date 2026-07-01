import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// 横评表只接收内容集合传来的列定义和工具行，不在组件里写业务数据
type Col = { key: string; label: string };
type Tool = { name: string; reviewSlug?: string; values: Record<string, string> };

const NAME = '__name__';

export default function CompareTable({ columns, tools }: { columns: Col[]; tools: Tool[] }) {
  // 排序状态独立保存在客户端，静态页面首屏仍由 Astro 输出
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduce = useReducedMotion();

  // 每次渲染复制一份 rows，避免直接修改 Astro 传入的原始 tools
  const rows = [...tools];
  if (sortKey) {
    rows.sort((a, b) => {
      const av = sortKey === NAME ? a.name : (a.values[sortKey] ?? '');
      const bv = sortKey === NAME ? b.name : (b.values[sortKey] ?? '');
      return av.localeCompare(bv, 'zh-Hans-CN', { numeric: true }) * dir;
    });
  }

  // 重点：同一列再次点击切换升降序，换列时恢复升序
  const toggle = (key: string) => {
    if (sortKey === key) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setDir(1);
    }
  };

  // 第一列是工具名，后续列来自 Markdown frontmatter 的 columns
  const headers = [{ key: NAME, label: '工具' }, ...columns];

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-subtle text-left">
            {headers.map((h) => {
              const active = sortKey === h.key;
              return (
                <th key={h.key} className="px-3 py-3 first:px-4">
                  <button
                    type="button"
                    onClick={() => toggle(h.key)}
                    className="group inline-flex items-center gap-1.5 whitespace-nowrap font-medium text-muted transition-colors hover:text-text"
                    aria-label={`按${h.label}排序`}
                  >
                    {h.label}
                    <span
                      className={`text-[0.7em] transition-opacity ${
                        active ? 'text-primary opacity-100' : 'opacity-25 group-hover:opacity-60'
                      }`}
                      aria-hidden="true"
                    >
                      {active ? (dir === 1 ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => (
            <motion.tr
              key={`${sortKey}-${dir}-${t.name}`}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: reduce ? 0 : i * 0.035, ease: [0.22, 1, 0.36, 1] }}
              className="border-b border-border transition-colors last:border-0 hover:bg-bg-subtle"
            >
              <td className="px-4 py-3 font-medium whitespace-nowrap">
                {t.reviewSlug ? (
                  <a href={`/reviews/${t.reviewSlug}`} className="text-primary hover:underline">
                    {t.name}
                  </a>
                ) : (
                  t.name
                )}
              </td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-3 whitespace-nowrap text-muted">
                  {t.values[c.key] ?? '—'}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
