"""Serving the built web app from the API, for the Docker image (one process, one port)."""

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger(__name__)

# Files under /assets have a hash in their name, so a changed file always has a new name.
IMMUTABLE = "public, max-age=31536000, immutable"
# The page itself must be re-checked, or a new version would never be noticed.
REVALIDATE = "no-cache"


def mount_web_app(app: FastAPI, dist: Path) -> bool:
    """Serve the files of a built web app (`web/dist`) on every path the API does not use.

    Real files (the scripts, styles, icons) are sent as they are; any other path gets `index.html`,
    so a reloaded or shared address such as `/?p=docs` opens the app. Paths under `/api` that match
    no route stay a plain 404. Returns False, serving nothing, when `dist` holds no built app.
    """
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning("WEB_DIST %s has no index.html: the web app is not served", dist)
        return False

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        # Resolving first keeps "../" and links from reaching anything outside the folder.
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            immutable = candidate.is_relative_to(root / "assets")
            return FileResponse(
                candidate, headers={"Cache-Control": IMMUTABLE if immutable else REVALIDATE}
            )
        return FileResponse(index, headers={"Cache-Control": REVALIDATE})

    return True
