"""Configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit

from dotenv import load_dotenv

# Pick up a .env file for local development. Searches upward from this file, so
# the repo-root .env is found whatever the working directory. Real environment
# variables always win over values in .env.
load_dotenv()


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set. Copy .env.example to .env and fill it in, or export {name}."
        )
    return value


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: _require("DATABASE_URL"))
    cors_origins: list[str] = field(default_factory=_cors_origins)
    pool_min: int = field(default_factory=lambda: int(os.getenv("POOL_MIN", "1")))
    pool_max: int = field(default_factory=lambda: int(os.getenv("POOL_MAX", "10")))
    max_page_size: int = 200

    @property
    def safe_dsn(self) -> str:
        """The DSN with any password removed, for logging."""
        parts = urlsplit(self.database_url)
        if parts.password:
            netloc = f"{parts.username}:***@{parts.hostname}"
            if parts.port:
                netloc += f":{parts.port}"
            parts = parts._replace(netloc=netloc)
        return urlunsplit(parts)


settings = Settings()
