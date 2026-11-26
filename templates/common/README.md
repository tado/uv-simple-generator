# {{PROJECT_NAME}}

A Python project managed with [uv](https://docs.astral.sh/uv/).

## Getting started

```bash
# install Python and dependencies into .venv
uv sync

# run the program
uv run {{MAIN_FILE}}

# add a dependency
uv add requests
```

In VS Code you can also press the **Run with uv** (▶) button in the editor title bar
or use `Cmd+R` / `Ctrl+R`.

## Project structure

```
{{PROJECT_NAME}}/
├── {{MAIN_FILE}}        # entry point
├── pyproject.toml # project metadata and dependencies
└── .python-version
```
