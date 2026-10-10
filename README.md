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
cd api && uv run pytest     # backend
cd web && pnpm test         # frontend (Vitest + Testing Library)
```

### Code style

Both projects are formatted and linted by tools that run the same way for everyone:
[Ruff](https://docs.astral.sh/ruff/) for Python and [Prettier](https://prettier.io) with
[oxlint](https://oxc.rs/docs/guide/usage/linter) for TypeScript.

```bash
cd api && uv run ruff format . && uv run ruff check .    # format, then lint
cd web && pnpm format && pnpm lint && pnpm typecheck     # format, lint, type-check
```

Use `uv run ruff check --fix .` to apply the safe lint fixes, and `pnpm format:check` /
`uv run ruff format --check .` to check formatting without changing files (for CI).

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

Direct browser transfers also require a CORS rule on the **bucket** that allows
`PUT` (uploads) and `GET` (previews, and downloading folders or a selection as a zip,
which the browser builds from files it fetches itself) from your frontend origin.

### Previews

Double-click a file, or press Enter on it, to look at it without downloading:
images, video, audio, PDFs and text or code (the first 256 KB). Arrow keys or the
buttons step through the other previewable files in the folder. The browser reads the
file straight from storage with a temporary link, so what it can show depends on your
browser and on the content type stored with the file. Files it cannot show are
downloaded on double-click as before.

### Resuming uploads

Files over 64 MiB are sent in parts. If the page is refreshed or the tab is closed
part-way, the upload is listed as **unfinished** in the upload panel. Choose the same
file again with **Resume** and only the parts missing from storage are sent. The browser
cannot keep a file across a refresh, so the file is matched by name, size and
modified time, and the list of unfinished uploads is kept in the browser's local
storage (a different browser or profile does not see it). An upload left for more than
7 days is aborted. The bucket lifecycle rule for incomplete uploads described under
Trash covers anything that is abandoned.

### Trash

Deleting a file or folder moves it to a reserved folder in the bucket,
`.cloudvault-trash/`, instead of removing it. It is hidden from the file list and
the API refuses to touch it except through the trash endpoints. A toast offers
**Undo** (Ctrl+Z also works), and the **Trash** page in the sidebar restores items
to where they were or deletes them for good. **Shift+Delete** deletes immediately,
after a confirmation. Restoring never overwrites: if the name is taken again the item
stays in the trash. A file over 5 GiB cannot be moved to the trash (it cannot be
copied in one step), so the app offers to delete it permanently instead.

Nothing leaves the trash on its own. To clean it up automatically, add a **lifecycle
rule** on the bucket that expires objects under the prefix `.cloudvault-trash/` after
a number of days (for example 30). Add another rule to abort incomplete multipart
uploads after a few days: an upload that is cancelled or interrupted can leave its
parts behind, and the bucket keeps (and bills) them until they are aborted.

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
