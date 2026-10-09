# CloudVault

A single-user web dashboard for managing files and folders in any S3-compatible
object store (AWS S3, MinIO, Cloudflare R2, ...). Files move directly between
the browser and storage through presigned URLs; the API never proxies file data
and never exposes storage credentials.

| Layer    | Stack                                       | Folder |
| -------- | ------------------------------------------- | ------ |
| Frontend | React, TypeScript, Tailwind CSS, Vite, pnpm | `web/` |
| Backend  | Python, FastAPI, Pydantic, boto3, uv        | `api/` |
| Storage  | Any S3-compatible service                   | -      |

Object storage is the source of truth: there is no database, and folders are
key prefixes.

## Requirements

- Node.js 20+ and [pnpm](https://pnpm.io)
- Python 3.11+ and [uv](https://docs.astral.sh/uv/)
- An S3-compatible bucket (for local development, [MinIO](https://min.io))

## Setup

### Backend

```bash
cd api
cp .env.example .env   # then fill in your storage settings
uv sync
uv run fastapi dev
```

The API serves on `http://127.0.0.1:8000` (docs at `/docs`).

### Frontend

```bash
cd web
pnpm install
pnpm dev
```

The app serves on `http://localhost:5173` and proxies `/api` to the backend.

### Tests

```bash
cd api
uv run pytest
```

## Deployment notes

The frontend calls the API under `/api` on its own origin. In production, serve
`web/dist` and the API behind one reverse proxy, or set `VITE_API_BASE_URL`
(see `web/.env.example`) at build time and add the frontend origin to
`CORS_ORIGINS`. The API has no authentication yet, so keep it off the public
internet.

## Storage configuration

Configured in `api/.env` (see `api/.env.example`):

| Variable              | Description                                  |
| --------------------- | -------------------------------------------- |
| `STORAGE_PROVIDER`    | `minio`, `s3` or `r2`                        |
| `S3_ENDPOINT`         | Endpoint URL (omit for AWS S3)               |
| `S3_REGION`           | Region (`auto` for R2)                       |
| `S3_BUCKET`           | Bucket name                                  |
| `S3_ACCESS_KEY`       | Access key (required)                        |
| `S3_SECRET_KEY`       | Secret key (required)                        |
| `S3_ADDRESSING_STYLE` | `path` or `virtual`                          |
| `MAX_UPLOAD_BYTES`    | Optional upload size limit (default 5 GiB)   |
| `CORS_ORIGINS`        | JSON list of allowed frontend origins        |

Direct browser uploads also require a CORS rule on the **bucket** that allows
`PUT`/`GET` from your frontend origin.

## Project layout

```text
cloudvault/
├── api/app/
│   ├── api/routes/        # thin HTTP routes
│   ├── core/              # settings
│   ├── schemas/           # Pydantic models
│   └── services/storage/  # storage abstraction + S3 implementation
└── web/src/
    ├── components/        # shared UI (common/, layout/)
    ├── features/          # files/, folders/, upload/
    ├── hooks/             # app-wide hooks
    ├── lib/               # pure helpers
    ├── pages/             # page-level composition
    ├── services/          # backend API + direct transfer clients
    └── types/             # shared TypeScript types
```
