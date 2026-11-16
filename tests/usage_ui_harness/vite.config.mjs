import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const harness = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(harness, '../..');
const appEnv = process.env.HERMES_DESKTOP_NODE_MODULES;
if (!appEnv || !path.isAbsolute(appEnv)) throw new Error('Set HERMES_DESKTOP_NODE_MODULES to an absolute Hermes Desktop node_modules path');
const app = path.resolve(appEnv);
const cacheDir = path.resolve(process.env.USAGE_UI_CACHE || path.join(process.env.TMPDIR || os.tmpdir(), 'limits-usage-ui-vite-cache'));
const modules = (...parts) => path.join(app, ...parts);

export default {
  root: harness,
  cacheDir,
  resolve: { alias: [
    { find: /^react\/jsx-runtime$/, replacement: modules('react/jsx-runtime.js') },
    { find: /^react\/jsx-dev-runtime$/, replacement: modules('react/jsx-dev-runtime.js') },
    { find: /^react$/, replacement: modules('react/index.js') },
    { find: /^react-dom\/client$/, replacement: modules('react-dom/client.js') },
    { find: /^@tanstack\/react-query$/, replacement: modules('@tanstack/react-query/build/modern/index.js') },
    { find: /^nanostores$/, replacement: modules('nanostores/index.js') },
    { find: /^radix-ui$/, replacement: modules('radix-ui/dist/index.mjs') }
  ] },
  optimizeDeps: { include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', '@tanstack/react-query', 'nanostores', 'radix-ui'] },
  server: { host: '127.0.0.1', port: 0, strictPort: false,
    proxy: { '/api': { target: process.env.USAGE_BRIDGE || 'http://127.0.0.1:0', rewrite: p => p.replace(/^\/api/, '') } },
    fs: { allow: [repo, app, path.resolve(app, '../../../node_modules/.pnpm'), cacheDir] } },
  plugins: [{ name: 'raw-limits-plugin', configureServer(server) {
    server.middlewares.use('/raw-product.js', (_req, res) => {
      res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(repo, 'desktop/plugin.js'), 'utf8'));
    });
  } }]
};
