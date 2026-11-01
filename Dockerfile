# CloudVault: one image with the API and the built web app.
#   docker build -t cloudvault .
#   docker run -p 8000:8000 --env-file api/.env cloudvault          → http://localhost:8000
# The storage settings (S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, ...) are passed as environment
# variables; see api/.env.example. Nothing secret is built into the image.

# ---- 1. Build the web app ---------------------------------------------------------------------
# Built once on the build machine's own platform: the output is static files for every image
FROM --platform=$BUILDPLATFORM node:24-slim AS web
RUN corepack enable
WORKDIR /app
# The workspace manifests first, so dependency installs are cached until they change
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter @cloudvault/web
COPY web/ web/
RUN pnpm --filter @cloudvault/web build

# ---- 2. Runtime: Python API serving the web app -----------------------------------------------
FROM python:3.15-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy

WORKDIR /app/api
# Dependencies first, so code changes don't reinstall them
COPY api/pyproject.toml api/uv.lock api/README.md ./
RUN uv sync --frozen --no-dev --no-install-project
COPY api/app ./app

COPY --from=web /app/web/dist /app/web-dist

RUN useradd --create-home --uid 1000 cloudvault
USER cloudvault

ENV PATH="/app/api/.venv/bin:$PATH" \
    WEB_DIST=/app/web-dist
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
