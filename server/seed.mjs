// 本地种子脚本：灌入占位作品，方便前后端没有真实素材时先跑通盲评流程
import { db } from './db.mjs';

// 已有作品时直接退出，避免重复灌入影响排行榜和投票样本
const existing = db.prepare('SELECT COUNT(*) AS n FROM works').get().n;
if (existing > 0) {
  console.log(`[seed] 已有 ${existing} 条作品，跳过。要重灌请先删 server/arena.db。`);
  process.exit(0);
}

// 预编译插入语句，下面循环只负责填数据
const now = new Date().toISOString();
const insPrompt = db.prepare('INSERT INTO prompts (category, text, note) VALUES (?, ?, ?)');
const insWork = db.prepare(
  'INSERT INTO works (category, prompt_id, model_label, media_url, created_at) VALUES (?, ?, ?, ?, ?)',
);

// media_url 先用 placeholder 占位；上传真图后改成真实 URL 即可
const DATA = [
  { category: 'image', text: '一只戴宇航头盔的柴犬，赛博朋克霓虹，电影感打光', models: ['模型 A', '模型 B', '模型 C', '模型 D'] },
  { category: 'image', text: '极简产品海报：一杯燕麦拿铁，暖色调，大量留白', models: ['模型 A', '模型 B', '模型 C', '模型 D'] },
  { category: 'code', text: '用 React 写一个可访问（a11y）的多选下拉组件', models: ['模型 A', '模型 B', '模型 C'] },
  { category: 'text', text: '把一段技术发布改写成小红书种草文案，别营销腔', models: ['模型 A', '模型 B', '模型 C'] },
];

// 每个 prompt 下挂多件模型作品，保证配对接口能随机抽到同题对比
let works = 0;
for (const p of DATA) {
  const { lastInsertRowid: promptId } = insPrompt.run(p.category, p.text, '示例 prompt');
  for (const m of p.models) {
    insWork.run(p.category, Number(promptId), m, 'placeholder', now);
    works++;
  }
}
console.log(`[seed] 灌入 ${DATA.length} 个 prompt、${works} 条占位作品（模型标签隐藏，翻牌可见）。`);
