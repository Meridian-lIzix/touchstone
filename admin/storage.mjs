// 媒体存储适配层：upload(buffer, name) -> url 的最小接口
// 默认 local 落盘 admin/uploads/（已 gitignore）；日后接阿里云 OSS 时
// 只需在此新增一个同接口的 adapter 并设 ADMIN_STORAGE=oss，调用方零改动
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_BASE } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = join(here, 'uploads');
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.txt', '.md']);

const localAdapter = {
  name: 'local',
  async upload(buffer, originalName) {
    const ext = extname(originalName || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new Error(`不支持的文件类型：${ext || '(无扩展名)'}`);
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID().slice(0, 13)}${ext}`;
    writeFileSync(join(UPLOAD_DIR, name), buffer);
    return `${PUBLIC_BASE}/uploads/${name}`;
  },
};

const ossAdapter = {
  name: 'oss',
  async upload() {
    throw new Error('OSS 适配器尚未接入凭证；请在 storage.mjs 补上传逻辑后再设 ADMIN_STORAGE=oss');
  },
};

const adapters = { local: localAdapter, oss: ossAdapter };
export const storage = adapters[process.env.ADMIN_STORAGE || 'local'] ?? localAdapter;
