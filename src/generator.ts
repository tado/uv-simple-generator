/**
 * Project generation logic. Deliberately free of any `vscode` import so it can be
 * unit-tested with plain Node.
 */
import * as fs from 'fs/promises';
import * as path from 'path';

export const MAIN_FILE = 'main.py';

export interface ProjectTemplate {
  /** Folder name under templates/. */
  id: string;
  label: string;
  description: string;
}

/** Selectable project templates; the first one is the default. */
export const TEMPLATES: readonly ProjectTemplate[] = [
  { id: 'blank', label: 'Blank', description: 'main.py only, no dependencies' },
  {
    id: 'data-science',
    label: 'Data Science',
    description: 'NumPy, pandas, Matplotlib, Seaborn, scikit-learn + a scatter plot',
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0].id;

/** Files shared by every template; a template's own files win over these. */
const COMMON_DIR = 'common';

export interface ProjectOptions {
  /** Display name; also used as the folder name. */
  projectName: string;
  /** One of TEMPLATES[].id; defaults to DEFAULT_TEMPLATE. */
  template?: string;
  /** Folder in which `<projectName>/` is created. */
  parentDir: string;
  /** Written to .python-version, e.g. "3.12". */
  pythonVersion: string;
  platform: NodeJS.Platform;
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;

/** Returns an error message, or undefined when the name is valid. */
export function validateProjectName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Project name is required.';
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return 'Use letters, digits, spaces, "-", "_" or "." and start with a letter or digit.';
  }
  if (trimmed.length > 100) {
    return 'Project name is too long.';
  }
  return undefined;
}

/** Normalizes a display name to a PEP 508 / PEP 503 project name. */
export function toPackageName(name: string): string {
  let pkg = name
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!pkg) {
    pkg = 'project';
  }
  return pkg;
}

/** "3.12.4" -> "3.12"; used for requires-python. */
export function requiresPython(pythonVersion: string): string {
  const m = /^(\d+)\.(\d+)/.exec(pythonVersion.trim());
  return m ? `${m[1]}.${m[2]}` : '3.12';
}

export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/**
 * Files in the template folder whose real name starts with "." are stored with a
 * leading "_" so that packaging tools never drop or interpret them.
 */
function outputName(templateName: string): string {
  return templateName.startsWith('_') ? `.${templateName.slice(1)}` : templateName;
}

async function copyTemplateDir(src: string, dest: string, vars: Record<string, string>): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, outputName(entry.name));
    if (entry.isDirectory()) {
      await copyTemplateDir(from, to, vars);
    } else {
      const text = await fs.readFile(from, 'utf8');
      await fs.writeFile(to, renderTemplate(text, vars), 'utf8');
    }
  }
}

export function venvPythonPath(platform: NodeJS.Platform): string {
  return platform === 'win32'
    ? '${workspaceFolder}\\.venv\\Scripts\\python.exe'
    : '${workspaceFolder}/.venv/bin/python';
}

function vscodeFiles(platform: NodeJS.Platform): Record<string, unknown> {
  return {
    'settings.json': {
      'python.defaultInterpreterPath': venvPythonPath(platform),
      'python.terminal.activateEnvironment': true,
      'files.exclude': {
        '**/__pycache__': true,
      },
    },
    'launch.json': {
      version: '0.2.0',
      configurations: [
        {
          name: `Python: Run ${MAIN_FILE}`,
          type: 'debugpy',
          request: 'launch',
          program: `\${workspaceFolder}/${MAIN_FILE}`,
          cwd: '${workspaceFolder}',
          console: 'integratedTerminal',
          justMyCode: true,
        },
        {
          name: 'Python: Run current file',
          type: 'debugpy',
          request: 'launch',
          program: '${file}',
          cwd: '${workspaceFolder}',
          console: 'integratedTerminal',
          justMyCode: true,
        },
      ],
    },
    'extensions.json': {
      recommendations: ['ms-python.python'],
    },
  };
}

/**
 * Generates the project and returns its absolute path. The target folder must not
 * exist yet (the caller is responsible for asking about / removing it).
 */
export async function generateProject(templatesRoot: string, opts: ProjectOptions): Promise<string> {
  const error = validateProjectName(opts.projectName);
  if (error) {
    throw new Error(error);
  }
  const template = opts.template ?? DEFAULT_TEMPLATE;
  if (!TEMPLATES.some((t) => t.id === template)) {
    throw new Error(`Unknown template: ${template}`);
  }
  const projectName = opts.projectName.trim();
  const projectDir = path.join(opts.parentDir, projectName);

  const vars: Record<string, string> = {
    PROJECT_NAME: projectName,
    PACKAGE_NAME: toPackageName(projectName),
    PYTHON_VERSION: opts.pythonVersion.trim() || '3.12',
    REQUIRES_PYTHON: requiresPython(opts.pythonVersion),
    MAIN_FILE,
  };

  await fs.mkdir(opts.parentDir, { recursive: true });
  // Fails with EEXIST instead of silently merging into an existing folder.
  await fs.mkdir(projectDir);

  await copyTemplateDir(path.join(templatesRoot, COMMON_DIR), projectDir, vars);
  // main.py and pyproject.toml.
  await copyTemplateDir(path.join(templatesRoot, template), projectDir, vars);

  const vscodeDir = path.join(projectDir, '.vscode');
  await fs.mkdir(vscodeDir, { recursive: true });
  for (const [name, content] of Object.entries(vscodeFiles(opts.platform))) {
    await fs.writeFile(path.join(vscodeDir, name), JSON.stringify(content, null, 2) + '\n', 'utf8');
  }

  return projectDir;
}
