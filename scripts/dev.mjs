import { spawn } from 'node:child_process';

const processes = [
  spawn('npm', ['run', 'start:dev', '--workspace', '@atlas/api'], {
    stdio: 'inherit',
    env: process.env,
  }),
  spawn('npm', ['run', 'start', '--workspace', '@atlas/mobile'], {
    stdio: 'inherit',
    env: process.env,
  }),
];

const stop = () => {
  for (const child of processes) child.kill('SIGTERM');
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of processes) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      stop();
      process.exitCode = code;
    }
  });
}
