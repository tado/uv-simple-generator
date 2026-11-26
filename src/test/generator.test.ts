import { strict as assert } from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
  DEFAULT_TEMPLATE,
  TEMPLATES,
  generateProject,
  requiresPython,
  toPackageName,
  validateProjectName,
} from '../generator';

const templatesRoot = path.resolve(__dirname, '..', '..', 'templates');

const MAIN_PY = `def main() -> None:
    """Main entry point."""
    print("Hello, World!")

if __name__ == "__main__":
    main()
`;

test('validateProjectName', () => {
  assert.equal(validateProjectName('my-project'), undefined);
  assert.equal(validateProjectName('My Project 2'), undefined);
  assert.ok(validateProjectName(''));
  assert.ok(validateProjectName('   '));
  assert.ok(validateProjectName('../evil'));
  assert.ok(validateProjectName('a/b'));
  assert.ok(validateProjectName('-leading'));
});

test('toPackageName normalizes to PEP 503', () => {
  assert.equal(toPackageName('My Project'), 'my-project');
  assert.equal(toPackageName('foo__bar..baz'), 'foo-bar-baz');
  assert.equal(toPackageName('  Hello  '), 'hello');
});

test('requiresPython', () => {
  assert.equal(requiresPython('3.12'), '3.12');
  assert.equal(requiresPython('3.13.1'), '3.13');
  assert.equal(requiresPython('garbage'), '3.12');
});

test('generateProject writes a complete project', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-gen-'));
  try {
    const dir = await generateProject(templatesRoot, {
      projectName: 'My Project',
      parentDir: parent,
      pythonVersion: '3.12',
      platform: 'darwin',
    });
    assert.equal(dir, path.join(parent, 'My Project'));

    const expected = [
      'pyproject.toml',
      '.python-version',
      '.gitignore',
      'README.md',
      'main.py',
      '.vscode/settings.json',
      '.vscode/launch.json',
      '.vscode/extensions.json',
    ];
    for (const f of expected) {
      await fs.access(path.join(dir, f));
    }

    // No leftover placeholders anywhere.
    for (const f of expected) {
      const text = await fs.readFile(path.join(dir, f), 'utf8');
      assert.ok(!/\{\{[A-Z_]+\}\}/.test(text), `${f} still has a placeholder`);
    }

    const pyproject = await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf8');
    assert.match(pyproject, /name = "my-project"/);
    assert.match(pyproject, /requires-python = ">=3.12"/);
    assert.match(pyproject, /dependencies = \[\]/);
    assert.equal((await fs.readFile(path.join(dir, '.python-version'), 'utf8')).trim(), '3.12');

    assert.equal(await fs.readFile(path.join(dir, 'main.py'), 'utf8'), MAIN_PY);

    const settings = JSON.parse(await fs.readFile(path.join(dir, '.vscode/settings.json'), 'utf8'));
    assert.equal(settings['python.defaultInterpreterPath'], '${workspaceFolder}/.venv/bin/python');
    JSON.parse(await fs.readFile(path.join(dir, '.vscode/launch.json'), 'utf8'));
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test('Data Science template adds the libraries and a scatter plot', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-gen-'));
  try {
    const dir = await generateProject(templatesRoot, {
      projectName: 'analysis',
      template: 'data-science',
      parentDir: parent,
      pythonVersion: '3.12',
      platform: 'darwin',
    });
    const pyproject = await fs.readFile(path.join(dir, 'pyproject.toml'), 'utf8');
    assert.match(pyproject, /name = "analysis"/);
    for (const dep of ['numpy', 'pandas', 'matplotlib', 'seaborn', 'scikit-learn']) {
      assert.match(pyproject, new RegExp(`"${dep}"`), dep);
    }
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(pyproject));

    const main = await fs.readFile(path.join(dir, 'main.py'), 'utf8');
    assert.match(main, /sns\.scatterplot\(/);
    assert.match(main, /^def main\(\) -> None:/m);

    // Shared files come from templates/common.
    for (const f of ['.gitignore', '.python-version', 'README.md', '.vscode/settings.json']) {
      await fs.access(path.join(dir, f));
    }
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test('every template folder exists, and unknown templates are rejected', async () => {
  for (const t of TEMPLATES) {
    await fs.access(path.join(templatesRoot, t.id, 'main.py'));
    await fs.access(path.join(templatesRoot, t.id, 'pyproject.toml'));
  }
  assert.equal(DEFAULT_TEMPLATE, 'blank');
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-gen-'));
  try {
    await assert.rejects(
      generateProject(templatesRoot, {
        projectName: 'x',
        template: 'nope',
        parentDir: parent,
        pythonVersion: '3.12',
        platform: 'darwin',
      }),
      /Unknown template/,
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test('generateProject refuses to merge into an existing folder', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-gen-'));
  try {
    await fs.mkdir(path.join(parent, 'taken'));
    await assert.rejects(
      generateProject(templatesRoot, {
        projectName: 'taken',
        parentDir: parent,
        pythonVersion: '3.12',
        platform: 'linux',
      }),
      /EEXIST/,
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});

test('Windows interpreter path', async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'uv-gen-'));
  try {
    const dir = await generateProject(templatesRoot, {
      projectName: 'win',
      parentDir: parent,
      pythonVersion: '3.13',
      platform: 'win32',
    });
    const settings = JSON.parse(await fs.readFile(path.join(dir, '.vscode/settings.json'), 'utf8'));
    assert.equal(settings['python.defaultInterpreterPath'], '${workspaceFolder}\\.venv\\Scripts\\python.exe');
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
