"""Long operations that report their progress as a stream of JSON lines (NDJSON).

A request opts in with `Accept: application/x-ndjson`; without it the route answers with a single
JSON body as usual. The stream carries events, one per line:

    {"type": "progress", "done": 3, "total": 120}
    {"type": "done", "result": {...}}                  the same body the plain request returns
    {"type": "error", "status": 409, "detail": "..."}  the HTTP status the plain request would use

If the client goes away (Cancel, or the tab closes) the operation is stopped and undone.
"""

import asyncio
import json
import logging
import queue
import threading
from collections.abc import Callable
from typing import Any

from fastapi import Request
from fastapi.responses import StreamingResponse

from app.services.storage.base import ProgressCallback
from app.services.storage.exceptions import StorageError, TransferCancelledError

logger = logging.getLogger(__name__)

NDJSON = "application/x-ndjson"


def wants_progress(request: Request) -> bool:
    return NDJSON in request.headers.get("accept", "")


def progress_stream(run: Callable[[ProgressCallback], dict[str, Any]]) -> StreamingResponse:
    """Run `run(progress)` in a thread and stream what it reports; `run` returns the result."""
    events: queue.Queue[dict[str, Any] | None] = queue.Queue()
    stopped = threading.Event()

    def report(done: int, total: int) -> None:
        if stopped.is_set():
            raise TransferCancelledError()
        events.put({"type": "progress", "done": done, "total": total})

    def work() -> None:
        try:
            events.put({"type": "done", "result": run(report)})
        except StorageError as e:
            events.put({"type": "error", "status": e.status_code, "detail": e.detail})
        except Exception:
            logger.exception("Unexpected error during a streamed operation")
            events.put({"type": "error", "status": 500, "detail": "Something went wrong"})
        finally:
            events.put(None)

    threading.Thread(target=work, daemon=True).start()

    async def lines():
        try:
            while (event := await asyncio.to_thread(events.get)) is not None:
                yield json.dumps(event) + "\n"
        finally:
            stopped.set()  # the client left: the next progress report stops the work

    return StreamingResponse(lines(), media_type=NDJSON)
