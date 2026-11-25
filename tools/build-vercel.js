// Builds the static site Vercel serves from dist/.
//  - The page's JavaScript and three.js become one minified file with a content hash in its name,
//    so browsers download it once and cache it for good (instead of ~20 separate unminified modules).
//  - The team (config/agents.yaml) is written to a static team.json, so the first thing the page asks for
//    comes from the CDN instead of waking up the serverless function.
//  - Source files that are never shown (the full animation library) are left out.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import YAML from 'yaml';

const LEAVE_OUT = new Set(['assets/people/UAL1_Standard.glb', 'js']);

rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true, filter: src => !LEAVE_OUT.has(path.relative('public', src).split(path.sep).join('/')) });

const result = await build({
  entryPoints: ['public/js/game.js'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  outdir: 'dist/js',
  entryNames: '[name]-[hash]',
  metafile: true,
  logLevel: 'warning',
});
const bundle = Object.keys(result.metafile.outputs).find(f => f.endsWith('.js'));
const html = readFileSync('public/index.html', 'utf8')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace('src="/js/game.js"', `src="/${path.relative('dist', bundle)}"`);
if (!html.includes(path.relative('dist', bundle))) throw new Error('index.html: could not point the page at the bundled script.');
writeFileSync('dist/index.html', html);

// Same shape as GET /api/team in server.js.
const { loadTeam } = await import('../team-config.js');
mkdirSync('dist/api-static', { recursive: true });
writeFileSync('dist/api-static/team.json', JSON.stringify(loadTeam(YAML.parse(readFileSync('config/agents.yaml', 'utf8')))));

console.log(`Built ${bundle} (${(readFileSync(bundle).length / 1e3).toFixed(0)} KB)`);
