import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const TERMINAL_NAME = 'uv run';

/** Walks up from `startDir` to the nearest folder containing pyproject.toml. */
export function findProjectRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pyproject.toml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function quote(arg: string): string {
  return /[\s"'&()$;]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Runs Python files with `uv run` in a dedicated terminal. Each run disposes the
 * previous terminal, which also stops the previous program.
 */
export class UvRunner implements vscode.Disposable {
  private terminal: vscode.Terminal | undefined;
  private readonly closeListener: vscode.Disposable;

  constructor() {
    this.closeListener = vscode.window.onDidCloseTerminal((t) => {
      if (t === this.terminal) {
        this.terminal = undefined;
      }
    });
  }

  run(uv: string, file: string): void {
    this.stop();
    const root = findProjectRoot(path.dirname(file)) ?? path.dirname(file);
    const rel = path.relative(root, file) || path.basename(file);

    this.terminal = vscode.window.createTerminal({ name: TERMINAL_NAME, cwd: root });
    this.terminal.show(true);

    let uvCmd = quote(uv);
    // PowerShell (the Windows default) needs the call operator for a quoted executable.
    if (process.platform === 'win32' && uvCmd.startsWith('"')) {
      uvCmd = `& ${uvCmd}`;
    }
    this.terminal.sendText(`${uvCmd} run ${quote(rel)}`);
  }

  stop(): void {
    this.terminal?.dispose();
    this.terminal = undefined;
  }

  dispose(): void {
    this.stop();
    this.closeListener.dispose();
  }
}
