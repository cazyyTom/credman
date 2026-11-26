"""Settings must refuse to start without its secrets instead of falling back."""

from __future__ import annotations

import pytest

from app.config import Settings


def test_missing_database_url_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings()


def test_empty_database_url_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "")
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings()


def test_database_url_read_from_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db.example:5432/x")
    settings = Settings()
    assert settings.database_url == "postgresql://u:p@db.example:5432/x"
    assert "p@" not in settings.safe_dsn
