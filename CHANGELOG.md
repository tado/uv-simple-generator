# Changelog

## 0.4.0

- The default `uvSimple.pythonVersion` for new projects is now `3.14` (was `3.12`).
  Existing projects keep their own `.python-version`.
- `uv sync` now runs automatically after a project is created: the default of
  `uvSimple.syncAfterCreate` is `always` (was `ask`). Set it to `never` to run `uv sync`
  yourself, or `ask` for the previous behavior.

## 0.3.1

- README: added a Requirements section explaining that uv is needed, with the official
  install commands and a link to the uv installation page.

## 0.3.0

- Added **uv: Add Package (uv add)**: adds dependencies to the current project with `uv add`
  (Command Palette, or right-click `pyproject.toml` in the Explorer).

## 0.2.1

- Enlarged the box in the extension icon.
- README: added Marketplace installation instructions.

## 0.2.0

- The wizard now asks for a template: **Blank** (default, the previous project) or
  **Data Science** (NumPy, pandas, Matplotlib, Seaborn, scikit-learn and a scatter-plot `main.py`).
  The wizard is now project name → template → parent folder.
- Added an extension icon (a package box with "uv" printed on its side).

## 0.1.0

- Initial version, based on processing-py Project Generator: project wizard
  (project name → parent folder), Explorer "Create Here", optional `uv sync`,
  Run / Stop via `uv run`. New projects open with `main.py`.
