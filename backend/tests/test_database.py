"""
Tests for the database module - per-repo database management.

Tests cover:
- Engine/session factory caching
- Database initialization
- Context manager for database sessions
- Engine cleanup
"""

import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock
import tempfile
import os

from app.database import (
    Base,
    _engines,
    _session_factories,
    _get_engine,
    _get_session_factory,
    init_repo_db,
    get_repo_db,
    close_all_engines,
    clear_engine_cache,
)


class TestEngineManagement:
    """Tests for engine creation and caching."""

    def setup_method(self):
        """Clear engine cache before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear engine cache after each test."""
        _engines.clear()
        _session_factories.clear()

    def test_get_engine_creates_new_engine(self, tmp_path):
        """Test that _get_engine creates a new engine for a path."""
        with patch("app.database.get_repo_db_path", return_value=tmp_path / "data.db"):
            engine = _get_engine(str(tmp_path / "repo"))

            assert engine is not None
            assert str(tmp_path / "repo") in _engines

    def test_get_engine_caches_engine(self, tmp_path):
        """Test that _get_engine returns cached engine on second call."""
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=tmp_path / "data.db"):
            engine1 = _get_engine(repo_path)
            engine2 = _get_engine(repo_path)

            assert engine1 is engine2
            assert len(_engines) == 1

    def test_get_engine_different_paths(self, tmp_path):
        """Test that different paths get different engines."""
        repo_path1 = str(tmp_path / "repo1")
        repo_path2 = str(tmp_path / "repo2")

        with patch("app.database.get_repo_db_path", side_effect=lambda p: tmp_path / f"{p.split('/')[-1]}.db"):
            engine1 = _get_engine(repo_path1)
            engine2 = _get_engine(repo_path2)

            assert engine1 is not engine2
            assert len(_engines) == 2


class TestSessionFactoryManagement:
    """Tests for session factory creation and caching."""

    def setup_method(self):
        """Clear caches before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear caches after each test."""
        _engines.clear()
        _session_factories.clear()

    def test_get_session_factory_creates_new_factory(self, tmp_path):
        """Test that _get_session_factory creates a new factory."""
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=tmp_path / "data.db"):
            factory = _get_session_factory(repo_path)

            assert factory is not None
            assert repo_path in _session_factories

    def test_get_session_factory_caches_factory(self, tmp_path):
        """Test that _get_session_factory returns cached factory."""
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=tmp_path / "data.db"):
            factory1 = _get_session_factory(repo_path)
            factory2 = _get_session_factory(repo_path)

            assert factory1 is factory2
            assert len(_session_factories) == 1


class TestDatabaseInitialization:
    """Tests for database initialization."""

    def setup_method(self):
        """Clear caches before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear caches after each test."""
        _engines.clear()
        _session_factories.clear()

    @pytest.mark.asyncio
    async def test_init_repo_db_creates_tables(self, tmp_path):
        """Test that init_repo_db creates database tables."""
        db_path = tmp_path / "data.db"
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=db_path):
            await init_repo_db(repo_path)

            # Database file should be created
            assert db_path.exists()

    @pytest.mark.asyncio
    async def test_init_repo_db_idempotent(self, tmp_path):
        """Test that init_repo_db can be called multiple times."""
        db_path = tmp_path / "data.db"
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=db_path):
            await init_repo_db(repo_path)
            await init_repo_db(repo_path)

            # Should not raise any errors
            assert db_path.exists()


class TestGetRepoDb:
    """Tests for the get_repo_db context manager."""

    def setup_method(self):
        """Clear caches before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear caches after each test."""
        _engines.clear()
        _session_factories.clear()

    @pytest.mark.asyncio
    async def test_get_repo_db_yields_session(self, tmp_path):
        """Test that get_repo_db yields a database session."""
        db_path = tmp_path / "data.db"
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=db_path):
            async with get_repo_db(repo_path) as session:
                assert session is not None
                # Session should have execute method
                assert hasattr(session, "execute")

    @pytest.mark.asyncio
    async def test_get_repo_db_initializes_db(self, tmp_path):
        """Test that get_repo_db initializes the database."""
        db_path = tmp_path / "data.db"
        repo_path = str(tmp_path / "repo")

        assert not db_path.exists()

        with patch("app.database.get_repo_db_path", return_value=db_path):
            async with get_repo_db(repo_path) as session:
                pass

            # Database should be created
            assert db_path.exists()


class TestCloseAllEngines:
    """Tests for engine cleanup."""

    def setup_method(self):
        """Clear caches before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear caches after each test."""
        _engines.clear()
        _session_factories.clear()

    @pytest.mark.asyncio
    async def test_close_all_engines_clears_caches(self, tmp_path):
        """Test that close_all_engines clears all caches."""
        db_path = tmp_path / "data.db"
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=db_path):
            # Create an engine
            _get_engine(repo_path)
            _get_session_factory(repo_path)

            assert len(_engines) == 1
            assert len(_session_factories) == 1

            await close_all_engines()

            assert len(_engines) == 0
            assert len(_session_factories) == 0


class TestClearEngineCache:
    """Tests for selective cache clearing."""

    def setup_method(self):
        """Clear caches before each test."""
        _engines.clear()
        _session_factories.clear()

    def teardown_method(self):
        """Clear caches after each test."""
        _engines.clear()
        _session_factories.clear()

    def test_clear_engine_cache_specific_path(self, tmp_path):
        """Test clearing cache for a specific path."""
        repo_path1 = str(tmp_path / "repo1")
        repo_path2 = str(tmp_path / "repo2")

        with patch("app.database.get_repo_db_path", side_effect=lambda p: tmp_path / f"{p.split('/')[-1]}.db"):
            _get_engine(repo_path1)
            _get_session_factory(repo_path1)
            _get_engine(repo_path2)
            _get_session_factory(repo_path2)

            assert len(_engines) == 2
            assert len(_session_factories) == 2

            clear_engine_cache(repo_path1)

            assert len(_engines) == 1
            assert len(_session_factories) == 1
            assert repo_path1 not in _engines
            assert repo_path2 in _engines

    def test_clear_engine_cache_all(self, tmp_path):
        """Test clearing all caches."""
        repo_path1 = str(tmp_path / "repo1")
        repo_path2 = str(tmp_path / "repo2")

        with patch("app.database.get_repo_db_path", side_effect=lambda p: tmp_path / f"{p.split('/')[-1]}.db"):
            _get_engine(repo_path1)
            _get_session_factory(repo_path1)
            _get_engine(repo_path2)
            _get_session_factory(repo_path2)

            clear_engine_cache(None)

            assert len(_engines) == 0
            assert len(_session_factories) == 0

    def test_clear_engine_cache_nonexistent_path(self, tmp_path):
        """Test clearing cache for a path that doesn't exist."""
        repo_path = str(tmp_path / "repo")

        with patch("app.database.get_repo_db_path", return_value=tmp_path / "data.db"):
            _get_engine(repo_path)

            # Should not raise
            clear_engine_cache(str(tmp_path / "nonexistent"))

            # Original should still be there
            assert len(_engines) == 1


class TestBase:
    """Tests for the Base class."""

    def test_base_is_declarative_base(self):
        """Test that Base is a proper SQLAlchemy declarative base."""
        # Base should have metadata attribute (registry of tables)
        assert hasattr(Base, "metadata")
        # Base.metadata should be a MetaData instance
        from sqlalchemy import MetaData
        assert isinstance(Base.metadata, MetaData)
