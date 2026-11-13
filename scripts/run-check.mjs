import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localNode = resolve(root, '.tools/node_modules/node/bin/node.exe');
const runtime = process.platform === 'win32' && existsSync(localNode) ? localNode : process.execPath;
const version = spawnSync(runtime, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || Number(version.stdout.trim().replace(/^v/, '').split('.')[0]) < 22) {
  console.error('PodyGuard checks require Node 22+. Install the version in .nvmrc, then run yarn install.');
  process.exit(1);
}
const mode = process.argv[2];
if (!['quick', 'push', 'release'].includes(mode)) throw new Error('Expected quick, push or release.');
mkdirSync(resolve(root, 'reports'), { recursive: true });
const reportPath = resolve(root, `reports/${mode}.log`);
const report = createWriteStream(reportPath);
const child = spawn(runtime, [resolve(root, '.yarn/releases/yarn-3.8.1.cjs'), `check:${mode}`], {
  cwd: root,
  env: { ...process.env, PATH: `${dirname(runtime)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` },
  stdio: ['inherit', 'pipe', 'pipe'],
});
child.stdout.on('data', data => { process.stdout.write(data); report.write(data); });
child.stderr.on('data', data => { process.stderr.write(data); report.write(data); });
child.on('error', error => { console.error(error.message); report.end(error.message); process.exitCode = 1; });
child.on('close', code => {
  report.end();
  if (code !== 0) console.error(`Checks failed. Log: ${reportPath}\nBrowser report (if browser tests ran): yarn test:e2e:report`);
  process.exitCode = code ?? 1;
});
