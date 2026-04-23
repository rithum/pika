"""FastAPI streaming wrapper for the Strands converse Lambda.

This app is served by the Lambda Web Adapter extension, which proxies
HTTP requests from the Function URL to this local FastAPI server and
streams chunked responses back to the client.

All business logic lives in handler.py. This module is a thin wrapper
that converts HTTP requests to Lambda events, runs handler.handler()
in a background thread, and yields chunks from a shared queue as they
arrive — giving the client real-time streaming.
"""
import asyncio
import json
import logging
import queue
import threading

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

import handler
from handler import _STREAM_DONE, _STREAM_HEADERS

logger = logging.getLogger(__name__)

app = FastAPI()


class _LambdaContext:
    """Mimics the Lambda context for handler.handler()."""
    def get_remaining_time_in_millis(self):
        return 300000  # 5 minutes


@app.post("/")
async def converse(request: Request):
    """Streaming converse endpoint.

    Runs handler.handler() in a background thread so it gets its own event loop
    (needed for Swarm stream_async). Chunks are yielded to the client as they
    arrive via a shared queue.
    """
    raw_body = await request.body()

    event = {
        'headers': dict(request.headers),
        'body': raw_body.decode('utf-8'),
    }

    chunk_queue = queue.Queue()
    context = _LambdaContext()

    # Run handler in a background thread — it writes chunks to chunk_queue
    thread = threading.Thread(
        target=handler.handler,
        args=(event, context, chunk_queue),
        daemon=True,
    )
    thread.start()

    # Wait for the handler to push response headers (session ID) before streaming.
    # The handler puts (_STREAM_HEADERS, {...}) on the queue before any content.
    loop = asyncio.get_event_loop()
    response_headers = {'Access-Control-Expose-Headers': 'x-chatbot-session-id'}
    first_item = await loop.run_in_executor(None, chunk_queue.get)
    if isinstance(first_item, tuple) and len(first_item) == 2 and first_item[0] is _STREAM_HEADERS:
        response_headers.update(first_item[1])
        first_item = None  # consumed — not a content chunk
    # If the handler sent a content chunk or error before headers, keep it for streaming.
    pending_first = first_item

    async def stream_generator():
        if pending_first is not None:
            if pending_first is _STREAM_DONE:
                return
            yield pending_first
        while True:
            chunk = await loop.run_in_executor(None, chunk_queue.get)
            if chunk is _STREAM_DONE:
                break
            yield chunk

    return StreamingResponse(
        stream_generator(),
        media_type='text/plain',
        headers=response_headers,
    )


@app.get("/health")
async def health():
    return {"status": "ok"}
