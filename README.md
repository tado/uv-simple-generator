# uv Simple Project Generator

A VS Code extension that creates and runs simple Python projects managed with
[uv](https://docs.astral.sh/uv/). It follows the same workflow as
[processing-py Project Generator](https://github.com/tado/processing-py.vscode), but generates a
plain, dependency-free project.

## Requirements

This extension needs [uv](https://docs.astral.sh/uv/), which installs Python and the project's
packages. Install it with the official script:

- macOS / Linux:

  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

- Windows (PowerShell):

  ```powershell
  powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
  ```

For other methods (Homebrew, WinGet, pip, ...), see the
[uv installation page](https://docs.astral.sh/uv/getting-started/installation/).
Restart VS Code after installing uv so it can be found.

## Installation

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=tadokoro.uv-simple-generator):

- In VS Code, open the Extensions view (`Cmd+Shift+X` / `Ctrl+Shift+X`), search for
  **uv Simple Project Generator**, and click **Install**, or
- run `code --install-extension tadokoro.uv-simple-generator`.

A `.vsix` file is also attached to each [GitHub release](https://github.com/tado/uv-simple-generator/releases);
install it with **Extensions: Install from VSIX...** in the Command Palette.

Then install uv (see [Requirements](#requirements)) and run **uv: Create a new uv Project** from the Command Palette.

## Features

- **uv: Create a new uv Project** (Command Palette)
  1. Project name
  2. Template: **Blank** (default) or **Data Science**
  3. Parent folder
  4. Optionally runs `uv sync` to install Python and dependencies into `.venv`
  5. Opens the project in this window or a new one and shows `main.py`
- **Create uv Project Here**: right-click a folder in the Explorer
  (asks only for the project name and template).
- **uv: Run with uv** (▶ in the editor title bar, `Cmd+R` / `Ctrl+R`):
  runs `uv run <file>` in a dedicated terminal. Running again restarts the program.
- **uv: Stop**: closes the run terminal.
- **uv: Add Package (uv add)** (Command Palette, or right-click `pyproject.toml` in the Explorer):
  enter one or more package names separated by spaces (version specifiers such as
  `requests>=2.31` and extras such as `requests[socks]` are allowed), and the extension runs
  `uv add` in the project. The project is the one containing the active file; if that cannot be
  determined, the `pyproject.toml` in the workspace is used (you are asked to choose if there are several).
  Output is written to the **uv Simple Project Generator** output channel.

## Templates

### Blank (default)

No dependencies. `main.py`:

```python
def main() -> None:
    """Main entry point."""
    print("Hello, World!")

if __name__ == "__main__":
    main()
```

### Data Science

`pyproject.toml` lists NumPy, pandas, Matplotlib, Seaborn and scikit-learn, and `main.py`
draws a simple scatter plot:

```python
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns


def main() -> None:
    """Main entry point."""
    rng = np.random.default_rng(seed=0)
    x = rng.normal(size=100)
    df = pd.DataFrame({"x": x, "y": 2 * x + rng.normal(size=100)})

    sns.scatterplot(data=df, x="x", y="y")
    plt.title("Scatter Plot")
    plt.show()

if __name__ == "__main__":
    main()
```

## Generated project

```
my-project/
├── main.py               # entry point (from the chosen template)
├── pyproject.toml        # dependencies (from the chosen template)
├── .python-version       # 3.12 (configurable)
├── README.md
├── .gitignore
└── .vscode/
    ├── settings.json     # interpreter = .venv
    ├── launch.json       # debugpy: run main.py / current file
    └── extensions.json   # recommends ms-python.python
```

Add dependencies with **uv: Add Package (uv add)** or `uv add <package>` in a terminal.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `uvSimple.uvPath` | `uv` | Path to uv. If set to `uv`, `~/.local/bin`, `~/.cargo/bin` and Homebrew locations are also tried. |
| `uvSimple.pythonVersion` | `3.12` | Written to `.python-version`; also sets `requires-python`. |
| `uvSimple.syncAfterCreate` | `ask` | `ask` / `always` / `never` run `uv sync` after creation. |

## Development

```bash
npm install
npm test          # compile + unit tests (node:test)
```

Press `F5` in VS Code to launch an Extension Development Host. Package with `npx @vscode/vsce package`.
