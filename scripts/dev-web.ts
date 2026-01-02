#!/usr/bin/env ts-node
/**
 * Simple helper to run backend + frontend together for browser dev.
 */
import { spawn } from 'child_process';

type ManagedProcess = ReturnType<typeof spawn>;

const processes: ManagedProcess[] = [];

const spawnProc = (cmd: string, args: string[]) => {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env },
  });

  processes.push(child);

  child.on('exit', (code, signal) => {
    // If one process exits, stop the others to keep things tidy
    processes.forEach((p) => {
      if (p.pid !== child.pid && !p.killed) {
        p.kill('SIGINT');
      }
    });

    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exitCode = code ?? 0;
    }
  });

  return child;
};

spawnProc('npm', ['run', 'start:backend', '--', '--no-open']);
spawnProc('npm', ['run', 'dev:frontend']);

const shutdown = () => {
  processes.forEach((p) => {
    if (!p.killed) {
      p.kill('SIGINT');
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
