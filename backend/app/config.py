"""Configuration, read once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit


def _cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str = field(
        default_factory=lambda: os.getenv(
            "DATABASE_URL",
            "postgresql://spendbook:ab7a8d51eb4863250ace6ca3b08231be51212f186c78eee623bfc19872605f64@localhost:5432/spendbook",
        )
    )
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
