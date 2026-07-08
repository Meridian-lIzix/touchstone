import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as proxyRequest } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = normalize(join(here, '..', 'dist'));
const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
const host = process.env.WEB_HOST ?? process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.WEB_PORT ?? process.env.PORT) || 4321;
const apiHost = process.env.API_HOST ?? '127.0.0.1';
const apiPort = Number(process.env.API_PORT) || 8787;

const types = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.md', 'text/plain; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const proxyPath = (path) => path === '/api' || path.startsWith('/api/') || path === '/media' || path.startsWith('/media/');

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function proxy(req, res) {
  const headers = { ...req.headers };
  delete headers.connection;
  delete headers['proxy-connection'];
  delete headers['keep-alive'];
  delete headers.upgrade;
  headers.host = `${apiHost}:${apiPort}`;
  headers['x-forwarded-host'] = req.headers.host ?? '';
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] ?? 'http';

  const upstream = proxyRequest({
    hostname: apiHost,
    port: apiPort,
    path: req.url,
    method: req.method,
    headers,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) send(res, 502, 'Bad Gateway');
    else res.destroy();
  });

  req.pipe(upstream);
}

function resolveFile(path) {
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rel = decoded.replace(/^\/+/, '');
  let candidate = normalize(join(root, rel));
  if (candidate !== root && !candidate.startsWith(rootPrefix)) return null;
  if (existsSync(candidate)) {
    const info = statSync(candidate);
    if (info.isDirectory()) candidate = join(candidate, 'index.html');
  } else if (!extname(candidate)) {
    candidate = join(candidate, 'index.html');
  }
  if (!existsSync(candidate)) {
    if (path.startsWith('/_astro/')) return null;
    candidate = join(root, 'index.html');
  }
  if (candidate !== root && !candidate.startsWith(rootPrefix)) return null;
  const info = statSync(candidate);
  if (!info.isFile()) return null;
  return { file: candidate, info };
}

function serveStatic(req, res, path) {
  const resolved = resolveFile(path);
  if (!resolved) return send(res, 404, 'Not Found');
  const ext = extname(resolved.file).toLowerCase();
  const headers = {
    'content-type': types.get(ext) ?? 'application/octet-stream',
    'content-length': resolved.info.size,
    'last-modified': resolved.info.mtime.toUTCString(),
  };
  if (path.startsWith('/_astro/')) {
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(resolved.file).pipe(res);
}

const server = createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    return send(res, 400, 'Bad Request');
  }
  if (proxyPath(url.pathname)) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
  return serveStatic(req, res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`[web] Touchstone web is running at http://${host}:${port}`);
});
