# CloudVault API

FastAPI backend for CloudVault. See the [root README](../README.md) for setup.

From the repository root, `pnpm dev` runs it with reload and `pnpm start` serves it together with the built web app. On its own:

```bash
uv sync
uv run python -m app --reload          # http://127.0.0.1:8000 (HOST and PORT change it); docs at /docs
uv run python -m app --serve-web       # also serve the built web app (run `pnpm build` first)
```

```bash
uv run pytest                          # tests
uv run ruff format .                   # format
uv run ruff check .                    # lint (add --fix for the safe fixes)
```
