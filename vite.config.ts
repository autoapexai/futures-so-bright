import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Player-facing version = the iteration number (commit count of the commit being built).
let ITERATION = '?';
try {
  ITERATION = execSync('git rev-list --count HEAD').toString().trim();
} catch {
  /* not a git checkout */
}

// Test hooks (window.__fsbTest) exist only in local FSB_TEST=1 builds. CI / deploy builds refuse them,
// so the production bundle never contains them (the dynamic import is compiled out when false).
const FSB_TEST = process.env.FSB_TEST === '1';
if (FSB_TEST && process.env.CI) throw new Error('FSB_TEST builds are not allowed in CI / deploy builds');

export default defineConfig({
  base: '/',
  define: {
    __FSB_TEST__: JSON.stringify(FSB_TEST),
    __BUILD_ITERATION__: JSON.stringify(ITERATION),
  },
  build: {
    target: 'es2022',
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
