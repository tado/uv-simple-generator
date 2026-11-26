import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MAIN_FILE, TEMPLATES, generateProject, validateProjectName } from './generator';
import { UvRunner, findProjectRoot } from './runner';
import { UV_INSTALL_URL, findUv, parsePackageInput, uvAdd, uvSync, validatePackageInput } from './uv';

const CONTEXT_IN_PROJECT = 'uvSimple.inProject';
const PENDING_OPEN_KEY = 'uvSimple.pendingOpenFile';

let output: vscode.OutputChannel;

function config() {
  const c = vscode.workspace.getConfiguration('uvSimple');
  return {
    uvPath: c.get<string>('uvPath', 'uv'),
    pythonVersion: c.get<string>('pythonVersion', '3.12'),
    syncAfterCreate: c.get<'ask' | 'always' | 'never'>('syncAfterCreate', 'ask'),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('uv Simple Project Generator');
  const runner = new UvRunner();
  context.subscriptions.push(output, runner);

  context.subscriptions.push(
    vscode.commands.registerCommand('uvSimple.createProject', () => createProject(context)),
    vscode.commands.registerCommand('uvSimple.createProjectHere', (uri?: vscode.Uri) =>
      createProject(context, uri),
    ),
    vscode.commands.registerCommand('uvSimple.runFile', (uri?: vscode.Uri) => runFile(runner, uri)),
    vscode.commands.registerCommand('uvSimple.stop', () => runner.stop()),
    vscode.commands.registerCommand('uvSimple.addPackage', (uri?: vscode.Uri) => addPackage(uri)),
  );

  void updateProjectContext();
  const watcher = vscode.workspace.createFileSystemWatcher('**/pyproject.toml');
  watcher.onDidCreate(() => updateProjectContext());
  watcher.onDidDelete(() => updateProjectContext());
  context.subscriptions.push(watcher, vscode.workspace.onDidChangeWorkspaceFolders(() => updateProjectContext()));

  void openPendingFile(context);
}

export function deactivate(): void {
  // Disposables are cleaned up through context.subscriptions.
}

// ---------------------------------------------------------------------------
// Project creation
// ---------------------------------------------------------------------------

async function createProject(context: vscode.ExtensionContext, targetParent?: vscode.Uri): Promise<void> {
  // "Create Here" already knows the parent folder, so it skips the folder step.
  const steps = targetParent ? 2 : 3;
  const projectName = await vscode.window.showInputBox({
    title: `New uv Project (1/${steps})`,
    prompt: 'Enter project name',
    placeHolder: 'my-project',
    value: 'my-project',
    validateInput: validateProjectName,
  });
  if (projectName === undefined) {
    return;
  }

  const picked = await vscode.window.showQuickPick(
    TEMPLATES.map((t, i) => ({
      label: t.label,
      description: i === 0 ? `${t.description} (default)` : t.description,
      id: t.id,
    })),
    { title: `New uv Project (2/${steps})`, placeHolder: 'Select a template' },
  );
  if (!picked) {
    return;
  }

  let parentUri = targetParent;
  if (!parentUri) {
    const folders = await vscode.window.showOpenDialog({
      title: 'New uv Project (3/3)',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select Parent Folder',
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });
    if (!folders || folders.length === 0) {
      return;
    }
    parentUri = folders[0];
  }

  const name = projectName.trim();
  const parentDir = parentUri.fsPath;
  const projectUri = vscode.Uri.file(path.join(parentDir, name));

  if (fs.existsSync(projectUri.fsPath)) {
    const choice = await vscode.window.showWarningMessage(
      `A folder named "${name}" already exists in ${parentDir}. Move it to the trash and create a new project?`,
      { modal: true },
      'Overwrite',
    );
    if (choice !== 'Overwrite') {
      return;
    }
    try {
      await vscode.workspace.fs.delete(projectUri, { recursive: true, useTrash: true });
    } catch (err) {
      void vscode.window.showErrorMessage(`Could not remove the existing folder: ${errorMessage(err)}`);
      return;
    }
  }

  const cfg = config();
  let projectDir: string;
  try {
    projectDir = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Creating uv project' },
      () =>
        generateProject(vscode.Uri.joinPath(context.extensionUri, 'templates').fsPath, {
          projectName: name,
          template: picked.id,
          parentDir,
          pythonVersion: cfg.pythonVersion,
          platform: process.platform,
        }),
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Failed to create project: ${errorMessage(err)}`);
    return;
  }
  output.appendLine(`Created ${projectDir}`);

  const synced = await maybeSync(projectDir, cfg);
  await offerOpen(context, projectDir, synced);
}

async function maybeSync(projectDir: string, cfg: ReturnType<typeof config>): Promise<boolean> {
  if (cfg.syncAfterCreate === 'never') {
    return false;
  }
  if (cfg.syncAfterCreate === 'ask') {
    const choice = await vscode.window.showInformationMessage(
      'Install Python and dependencies into .venv now? (runs "uv sync")',
      'Run uv sync',
      'Later',
    );
    if (choice !== 'Run uv sync') {
      return false;
    }
  }

  const uv = await findUv(cfg.uvPath);
  if (!uv) {
    const choice = await vscode.window.showWarningMessage(
      'uv was not found. Install uv, then run "uv sync" in the project folder.',
      'How to Install uv',
    );
    if (choice) {
      void vscode.env.openExternal(vscode.Uri.parse(UV_INSTALL_URL));
    }
    return false;
  }

  output.appendLine(`> ${uv.command} sync   (${uv.version}, cwd: ${projectDir})`);
  const code = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'uv sync',
      cancellable: true,
    },
    (progress, token) => {
      const handle = uvSync(uv.command, projectDir, (text) => {
        output.append(text);
        const last = text.trim().split(/\r?\n/).pop();
        if (last) {
          progress.report({ message: last.slice(0, 80) });
        }
      });
      token.onCancellationRequested(() => handle.cancel());
      return handle.done;
    },
  );

  if (code !== 0) {
    const choice = await vscode.window.showErrorMessage(
      `uv sync failed (exit code ${code}). You can retry with "uv sync" in the project folder.`,
      'Show Output',
    );
    if (choice) {
      output.show();
    }
    return false;
  }
  return true;
}

async function offerOpen(context: vscode.ExtensionContext, projectDir: string, synced: boolean): Promise<void> {
  const projectUri = vscode.Uri.file(projectDir);
  const mainUri = vscode.Uri.joinPath(projectUri, MAIN_FILE);

  // Created inside the current workspace (e.g. via the Explorer context menu):
  // just open main.py.
  if (vscode.workspace.getWorkspaceFolder(projectUri)) {
    await vscode.window.showTextDocument(mainUri);
    void updateProjectContext();
    void vscode.window.showInformationMessage(
      synced ? 'uv project created. Press ▶ to run main.py.' : 'uv project created.',
    );
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `uv project "${path.basename(projectDir)}" created.`,
    'Open Project',
    'Open in New Window',
  );
  if (!choice) {
    return;
  }
  // The window reloads on openFolder, so remember which file to show afterwards.
  await context.globalState.update(PENDING_OPEN_KEY, mainUri.fsPath);
  await vscode.commands.executeCommand('vscode.openFolder', projectUri, {
    forceNewWindow: choice === 'Open in New Window',
  });
}

async function openPendingFile(context: vscode.ExtensionContext): Promise<void> {
  const pending = context.globalState.get<string>(PENDING_OPEN_KEY);
  if (!pending) {
    return;
  }
  const uri = vscode.Uri.file(pending);
  if (!vscode.workspace.getWorkspaceFolder(uri)) {
    return; // Not this window's project; another window will pick it up.
  }
  await context.globalState.update(PENDING_OPEN_KEY, undefined);
  if (fs.existsSync(pending)) {
    await vscode.window.showTextDocument(uri);
  }
}

// ---------------------------------------------------------------------------
// Running files
// ---------------------------------------------------------------------------

async function runFile(runner: UvRunner, uri?: vscode.Uri): Promise<void> {
  let target = uri && uri.scheme === 'file' ? uri : vscode.window.activeTextEditor?.document.uri;

  if (!target || target.scheme !== 'file' || !target.fsPath.endsWith('.py')) {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const fallback = folder && vscode.Uri.joinPath(folder.uri, MAIN_FILE);
    if (!fallback || !fs.existsSync(fallback.fsPath)) {
      void vscode.window.showErrorMessage('Open a Python file to run it.');
      return;
    }
    target = fallback;
  }

  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === target!.fsPath);
  if (doc?.isDirty) {
    await doc.save();
  }

  const uv = await findUv(config().uvPath);
  if (!uv) {
    const choice = await vscode.window.showErrorMessage(
      'uv was not found. Python files are run with "uv run".',
      'How to Install uv',
    );
    if (choice) {
      void vscode.env.openExternal(vscode.Uri.parse(UV_INSTALL_URL));
    }
    return;
  }

  if (!findProjectRoot(path.dirname(target.fsPath))) {
    void vscode.window.showWarningMessage(
      'No pyproject.toml was found for this file; running it with "uv run" in its own folder.',
    );
  }
  runner.run(uv.command, target.fsPath);
}

// ---------------------------------------------------------------------------
// Adding packages (uv add)
// ---------------------------------------------------------------------------

async function addPackage(uri?: vscode.Uri): Promise<void> {
  const projectDir = await pickProjectDir(uri);
  if (!projectDir) {
    return;
  }

  const input = await vscode.window.showInputBox({
    title: `Add Package (uv add) — ${path.basename(projectDir)}`,
    prompt: 'Package names separated by spaces (version specifiers are allowed)',
    placeHolder: 'numpy requests>=2.31',
    validateInput: validatePackageInput,
  });
  if (input === undefined) {
    return;
  }
  const packages = parsePackageInput(input);

  const uv = await findUv(config().uvPath);
  if (!uv) {
    const choice = await vscode.window.showErrorMessage(
      'uv was not found. Packages are added with "uv add".',
      'How to Install uv',
    );
    if (choice) {
      void vscode.env.openExternal(vscode.Uri.parse(UV_INSTALL_URL));
    }
    return;
  }

  // Save pyproject.toml first so uv does not overwrite unsaved edits (and vice versa).
  const pyproject = path.join(projectDir, 'pyproject.toml');
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === pyproject);
  if (doc?.isDirty) {
    await doc.save();
  }

  const label = packages.join(' ');
  output.appendLine(`> ${uv.command} add ${label}   (${uv.version}, cwd: ${projectDir})`);
  const code = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `uv add ${label}`, cancellable: true },
    (progress, token) => {
      const handle = uvAdd(uv.command, packages, projectDir, (text) => {
        output.append(text);
        const last = text.trim().split(/\r?\n/).pop();
        if (last) {
          progress.report({ message: last.slice(0, 80) });
        }
      });
      token.onCancellationRequested(() => handle.cancel());
      return handle.done;
    },
  );

  if (code !== 0) {
    const choice = await vscode.window.showErrorMessage(
      `uv add failed (exit code ${code}).`,
      'Show Output',
    );
    if (choice) {
      output.show();
    }
    return;
  }
  void vscode.window.showInformationMessage(`Added ${label} to ${path.basename(projectDir)}.`);
}

/**
 * Chooses the uv project to operate on: the one containing `uri` or the active
 * editor's file, otherwise a pyproject.toml in the workspace (asking if several).
 */
async function pickProjectDir(uri?: vscode.Uri): Promise<string | undefined> {
  const start = uri?.scheme === 'file' ? uri : vscode.window.activeTextEditor?.document.uri;
  if (start?.scheme === 'file') {
    const isDir = fs.existsSync(start.fsPath) && fs.statSync(start.fsPath).isDirectory();
    const root = findProjectRoot(isDir ? start.fsPath : path.dirname(start.fsPath));
    if (root) {
      return root;
    }
  }

  const found = await vscode.workspace.findFiles('**/pyproject.toml', '**/{.venv,node_modules,.git}/**', 50);
  if (found.length === 0) {
    void vscode.window.showErrorMessage('No pyproject.toml was found. Create a uv project first.');
    return undefined;
  }
  if (found.length === 1) {
    return path.dirname(found[0].fsPath);
  }
  const picked = await vscode.window.showQuickPick(
    found
      .map((f) => path.dirname(f.fsPath))
      .sort()
      .map((dir) => ({ label: path.basename(dir), description: vscode.workspace.asRelativePath(dir), dir })),
    { title: 'Add Package (uv add)', placeHolder: 'Select a project' },
  );
  return picked?.dir;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Updates the `uvSimple.inProject` context key (any pyproject.toml in the workspace). */
async function updateProjectContext(): Promise<void> {
  const found = await vscode.workspace.findFiles('**/pyproject.toml', '**/{.venv,node_modules,.git}/**', 1);
  await vscode.commands.executeCommand('setContext', CONTEXT_IN_PROJECT, found.length > 0);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
