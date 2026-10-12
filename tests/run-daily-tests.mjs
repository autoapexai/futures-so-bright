// Bundles tests/daily.test.ts with esbuild (ships with Vite) and runs it in Node.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
const out = '/tmp/fsb-daily-test.mjs';
await build({ entryPoints: [new URL('./daily.test.ts', import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error' });
await import(pathToFileURL(out).href + '?t=' + Date.now());
