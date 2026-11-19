import { cpSync, mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });
mkdirSync('dist/vendor/three', { recursive: true });
for (const item of ['build', 'examples/jsm', 'LICENSE']) {
  cpSync(`node_modules/three/${item}`, `dist/vendor/three/${item}`, { recursive: true });
}
