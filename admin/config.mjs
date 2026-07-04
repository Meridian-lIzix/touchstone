// 端口与对外地址的唯一来源：上传返回的媒体 URL 必须与实际监听端口一致
export const PORT = Number(process.env.ADMIN_PORT ?? process.env.PORT) || 8790;
export const PUBLIC_BASE = process.env.ADMIN_PUBLIC_BASE || `http://localhost:${PORT}`;
