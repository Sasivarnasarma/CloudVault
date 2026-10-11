"""Run the API: `uv run python -m app` from the `api/` folder.

`--reload` restarts the server whenever the code changes (for development; `pnpm dev` uses it).
`--serve-web` also serves the built web app (`pnpm build`), like the Docker image (`pnpm start`).
The address comes from HOST and PORT (default 127.0.0.1:8000).
"""

import argparse
import os
from pathlib import Path

import uvicorn

from app.core.config import settings

API_DIR = Path(__file__).resolve().parent.parent
# Where `pnpm build` puts the web app, relative to this checkout
CHECKOUT_WEB_DIST = API_DIR.parent / "web" / "dist"


def web_dist() -> Path:
    """The folder with the built web app: WEB_DIST if set, else this checkout's `web/dist`."""
    return Path(settings.WEB_DIST) if settings.WEB_DIST else CHECKOUT_WEB_DIST


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app", description="Run the CloudVault API.")
    parser.add_argument(
        "--reload", action="store_true", help="restart when the code changes (development)"
    )
    parser.add_argument(
        "--serve-web",
        action="store_true",
        help="also serve the built web app (run `pnpm build` first), like the Docker image",
    )
    args = parser.parse_args(argv)

    if args.serve_web:
        dist = web_dist()
        if not (dist / "index.html").is_file():
            parser.error(f"no built web app in {dist}: run `pnpm build` first, or set WEB_DIST")
        # The app reads its settings when uvicorn imports it, in this process or (with --reload)
        # in the one it starts, so both are told.
        settings.WEB_DIST = str(dist.resolve())
        os.environ["WEB_DIST"] = settings.WEB_DIST

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=args.reload,
        reload_dirs=[str(API_DIR / "app")] if args.reload else None,
    )


if __name__ == "__main__":
    main()
