// `npm run dev` — both apps, each with its own .env:
//   apps/api  → Express on :4100 (PORT in apps/api/.env)
//   apps/web  → Next on :3100, proxying /api/* to API_ORIGIN (apps/web/.env)
// Ctrl+C stops both.
import { spawn, spawnSync } from 'node:child_process';

const shell = process.platform === 'win32';

const procs = [
  spawn('npm', ['run', 'dev', '--workspace', 'apps/api'], { stdio: 'inherit', shell }),
  spawn('npm', ['run', 'dev', '--workspace', 'apps/web'], { stdio: 'inherit', shell }),
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
