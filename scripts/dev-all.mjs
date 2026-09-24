// `npm run dev` — both apps, from the one root .env:
//   apps/api  → Express on :4100 (PORT; the API loads ../../.env itself)
//   apps/web  → Next on :3100, proxying /api/* to API_ORIGIN — the ONLY value
//               the web app is given; it never sees a secret.
// Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const shell = process.platform === 'win32';
const rootEnv = new URL('../.env', import.meta.url);
const { API_ORIGIN } = existsSync(rootEnv) ? parseEnv(readFileSync(rootEnv, 'utf8')) : {};
const webEnv = { ...process.env, ...(API_ORIGIN ? { API_ORIGIN } : {}) };

const procs = [
  spawn('npm', ['run', 'dev', '--workspace', 'apps/api'], { stdio: 'inherit', shell }),
  spawn('npm', ['run', 'dev', '--workspace', 'apps/web'], { stdio: 'inherit', shell, env: webEnv }),
];

// With shell: true, p.kill() on Windows only ends the cmd.exe wrapper and
// leaves next dev / tsx watch holding their ports — kill the whole tree.
const killTree = (p) => {
  if (p.exitCode !== null || p.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill('SIGTERM');
};

let stopping = false;
const stopAll = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) killTree(p);
  process.exit(code);
};
for (const p of procs) p.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
