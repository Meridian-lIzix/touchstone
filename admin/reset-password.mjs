// 找回入口：node admin/reset-password.mjs <新密码>（v1 单账号，不做账号管理界面）
import { setPassword } from './db.mjs';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('用法：node admin/reset-password.mjs <新密码>（至少 8 位）');
  process.exit(1);
}
if (setPassword('admin', password)) {
  console.log('[admin] admin 密码已重置。');
} else {
  console.error('[admin] 未找到 admin 账号；先启动一次管理后台让它自动创建。');
  process.exit(1);
}
