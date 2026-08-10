"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import rewards, transactions
from app.config import settings
from app.db import healthcheck, pool

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("credman")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    log.info("database pool open -> %s", settings.safe_dsn)
    try:
        yield
    finally:
        pool.close()
        log.info("database pool closed")


app = FastAPI(
    title="CredMan API",
    version="1.0.0",
    description="Transactions, spend analytics and reward coins.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """
    Collapse FastAPI's nested validation output into the same {code, message}
    shape every other error uses, so the client has one error renderer.
    """
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p != "query")
    return JSONResponse(
        status_code=422,
        content={
            "code": "invalid_request",
            "message": first.get("msg", "That request could not be read."),
            "detail": {"field": field} if field else None,
        },
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "code": "internal_error",
            "message": "Something went wrong on our side. Try again.",
        },
    )


@app.get("/health", tags=["meta"])
def health():
    ok = healthcheck()
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "database": ok},
    )


app.include_router(transactions.router)
app.include_router(rewards.router)
