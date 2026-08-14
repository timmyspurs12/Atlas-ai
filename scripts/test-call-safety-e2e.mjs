import { spawnSync } from 'node:child_process';

const databaseName = 'atlas_e2e';
const databaseUrl = 'postgresql://atlas:atlas_dev_only@127.0.0.1:5432/atlas_e2e?schema=public';
const redisUrl = 'redis://127.0.0.1:6379/15';
const compose = ['compose', '-f', 'infra/docker-compose.yml'];

run('docker', [...compose, 'up', '-d', '--wait', 'postgres', 'redis']);

const exists = run(
  'docker',
  [
    ...compose,
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'atlas',
    '-d',
    'postgres',
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname='${databaseName}'`,
  ],
  { capture: true },
).trim();

if (exists !== '1') {
  run('docker', [...compose, 'exec', '-T', 'postgres', 'createdb', '-U', 'atlas', databaseName]);
}

const environment = {
  ...process.env,
  NODE_ENV: 'test',
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--max-old-space-size=4096'].filter(Boolean).join(' '),
  DATABASE_URL: databaseUrl,
  ATLAS_E2E_DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  ATLAS_E2E_REDIS_URL: redisUrl,
};

runNpm(['run', 'prisma:deploy', '--workspace', '@atlas/api'], { env: environment });
runNpm(['run', 'test:e2e'], { env: environment });

console.log('Stay With Me isolated REST and Socket.IO end-to-end tests passed.');

function runNpm(args, options = {}) {
  run('npm', args, { ...options, shell: process.platform === 'win32' });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    shell: options.shell ?? false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
  return options.capture ? (result.stdout ?? '') : '';
}
