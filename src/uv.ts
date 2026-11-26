import { execFile, spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';

export const UV_INSTALL_URL = 'https://docs.astral.sh/uv/getting-started/installation/';

function tryVersion(cmd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(cmd, ['--version'], { timeout: 10_000 }, (err, stdout) => {
      resolve(err ? undefined : stdout.trim());
    });
  });
}

/**
 * Finds a working uv executable. When the setting is left at "uv", well-known
 * install locations are tried too, because a GUI-launched VS Code does not always
 * inherit the login shell PATH.
 */
export async function findUv(configured: string): Promise<{ command: string; version: string } | undefined> {
  const candidates = [configured.trim() || 'uv'];
  if (candidates[0] === 'uv') {
    const home = os.homedir();
    const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
    candidates.push(
      path.join(home, '.local', 'bin', exe),
      path.join(home, '.cargo', 'bin', exe),
    );
    if (process.platform !== 'win32') {
      candidates.push('/opt/homebrew/bin/uv', '/usr/local/bin/uv');
    }
  }
  for (const command of candidates) {
    const version = await tryVersion(command);
    if (version) {
      return { command, version };
    }
  }
  return undefined;
}

export interface SyncHandle {
  done: Promise<number>;
  cancel(): void;
}

/** Runs `uv sync` in `cwd`, streaming combined output to `onOutput`. */
export function uvSync(uv: string, cwd: string, onOutput: (text: string) => void): SyncHandle {
  const child = spawn(uv, ['sync'], { cwd, env: { ...process.env, NO_COLOR: '1' } });
  child.stdout.on('data', (d: Buffer) => onOutput(d.toString()));
  child.stderr.on('data', (d: Buffer) => onOutput(d.toString()));
  const done = new Promise<number>((resolve) => {
    child.on('error', (err) => {
      onOutput(`${err.message}\n`);
      resolve(-1);
    });
    child.on('close', (code) => resolve(code ?? -1));
  });
  return { done, cancel: () => child.kill() };
}
