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

export interface UvHandle {
  done: Promise<number>;
  cancel(): void;
}

/** Runs `uv <args>` in `cwd`, streaming combined output to `onOutput`. */
export function runUv(uv: string, args: string[], cwd: string, onOutput: (text: string) => void): UvHandle {
  const child = spawn(uv, args, { cwd, env: { ...process.env, NO_COLOR: '1' } });
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

/** Runs `uv sync` in `cwd`, streaming combined output to `onOutput`. */
export function uvSync(uv: string, cwd: string, onOutput: (text: string) => void): UvHandle {
  return runUv(uv, ['sync'], cwd, onOutput);
}

/** Runs `uv add <packages...>` in `cwd`, streaming combined output to `onOutput`. */
export function uvAdd(uv: string, packages: readonly string[], cwd: string, onOutput: (text: string) => void): UvHandle {
  return runUv(uv, ['add', ...packages], cwd, onOutput);
}

/**
 * Splits the "Add Package" input into requirement strings, e.g.
 * "numpy pandas>=2  requests[socks]" -> ["numpy", "pandas>=2", "requests[socks]"].
 * Commas also separate entries unless they are inside brackets
 * ("requests[socks,security]") or part of a version list ("numpy>=1.26,<3").
 */
export function parsePackageInput(input: string): string[] {
  const result: string[] = [];
  for (const token of input.trim().split(/\s+/)) {
    let depth = 0;
    let current = '';
    for (let i = 0; i < token.length; i++) {
      const ch = token[i];
      if (ch === '[') {
        depth++;
      } else if (ch === ']') {
        depth = Math.max(0, depth - 1);
      } else if (ch === ',' && depth === 0 && !/[<>=!~]/.test(token[i + 1] ?? '')) {
        // A comma followed by a comparison operator belongs to the version list.
        if (current) {
          result.push(current);
        }
        current = '';
        continue;
      }
      current += ch;
    }
    if (current) {
      result.push(current);
    }
  }
  return result;
}

/** Returns an error message for invalid "Add Package" input, or undefined if it is OK. */
export function validatePackageInput(input: string): string | undefined {
  const packages = parsePackageInput(input);
  if (packages.length === 0) {
    return 'Enter at least one package name.';
  }
  const bad = packages.find((p) => p.startsWith('-'));
  if (bad) {
    return `"${bad}" looks like an option. Enter package names only (e.g. numpy requests>=2).`;
  }
  return undefined;
}
