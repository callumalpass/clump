"""
Tests for the FastAPI application main module.

Tests cover:
- Application lifespan management
- Health endpoint
- CORS middleware configuration
- Router registration
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app, lifespan


class TestHealthEndpoint:
    """Tests for the /api/health endpoint."""

    def test_health_returns_ok(self):
        """Test that health endpoint returns status ok."""
        client = TestClient(app)
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_method_not_allowed(self):
        """Test that health endpoint only accepts GET requests."""
        client = TestClient(app)
        response = client.post("/api/health")
        assert response.status_code == 405

        response = client.put("/api/health")
        assert response.status_code == 405

        response = client.delete("/api/health")
        assert response.status_code == 405


class TestAppConfiguration:
    """Tests for the FastAPI app configuration."""

    def test_app_title(self):
        """Test that app has correct title."""
        assert app.title == "Clump"

    def test_app_description(self):
        """Test that app has correct description."""
        assert "Claude Code" in app.description

    def test_app_version(self):
        """Test that app has a version set."""
        assert app.version == "0.1.0"


class TestRouterRegistration:
    """Tests for router registration."""

    def test_github_router_registered(self):
        """Test that github router is registered."""
        client = TestClient(app)
        # Check that a route from github router exists
        # GitHub router uses /api/repos
        response = client.get("/api/repos")
        # 401 or 200 indicates route exists (vs 404)
        assert response.status_code != 404

    def test_processes_router_registered(self):
        """Test that processes router is registered."""
        client = TestClient(app)
        response = client.get("/api/processes")
        assert response.status_code != 404

    def test_sessions_router_registered(self):
        """Test that sessions router is registered."""
        client = TestClient(app)
        response = client.get("/api/sessions")
        assert response.status_code != 404

    def test_settings_router_registered(self):
        """Test that settings router is registered."""
        client = TestClient(app)
        # Settings router uses /api/settings/github-token
        response = client.get("/api/settings/github-token")
        assert response.status_code != 404

    def test_headless_router_registered(self):
        """Test that headless router is registered."""
        client = TestClient(app)
        # Check that headless running endpoint exists
        response = client.get("/api/headless/running")
        assert response.status_code != 404

    def test_tags_router_registered(self):
        """Test that tags router is registered."""
        # Tags router is nested under /api/repos/{repo_id}/tags
        # Check via OpenAPI schema instead
        client = TestClient(app)
        response = client.get("/openapi.json")
        schema = response.json()
        tag_routes = [p for p in schema["paths"].keys() if "/tags" in p]
        assert len(tag_routes) > 0

    def test_commands_router_registered(self):
        """Test that commands router is registered."""
        client = TestClient(app)
        response = client.get("/api/commands")
        assert response.status_code != 404


class TestCORSMiddleware:
    """Tests for CORS middleware configuration."""

    def test_cors_allows_localhost_5173(self):
        """Test that CORS allows requests from localhost:5173."""
        client = TestClient(app)
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"

    def test_cors_allows_127_0_0_1_5173(self):
        """Test that CORS allows requests from 127.0.0.1:5173."""
        client = TestClient(app)
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"

    def test_cors_allows_credentials(self):
        """Test that CORS allows credentials."""
        client = TestClient(app)
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.headers.get("access-control-allow-credentials") == "true"

    def test_cors_allows_all_methods(self):
        """Test that CORS allows all HTTP methods."""
        client = TestClient(app)
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
            },
        )
        allow_methods = response.headers.get("access-control-allow-methods", "")
        # Wildcard or specific methods should be allowed
        assert "POST" in allow_methods or "*" in allow_methods

    def test_cors_denies_other_origins(self):
        """Test that CORS does not allow other origins."""
        client = TestClient(app)
        response = client.options(
            "/api/health",
            headers={
                "Origin": "http://evil.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        # Should either not have the header or have a different origin
        allow_origin = response.headers.get("access-control-allow-origin")
        assert allow_origin is None or allow_origin != "http://evil.com"


class TestLifespan:
    """Tests for the application lifespan context manager."""

    @pytest.mark.asyncio
    async def test_lifespan_creates_clump_dir(self):
        """Test that lifespan ensures clump directory exists on startup."""
        mock_app = MagicMock()

        with patch("app.main.get_clump_dir") as mock_get_clump_dir, \
             patch("app.main.close_all_engines", new_callable=AsyncMock) as mock_close:
            async with lifespan(mock_app):
                # Should have called get_clump_dir on startup
                mock_get_clump_dir.assert_called_once()

            # Should have called close_all_engines on shutdown
            mock_close.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_closes_engines_on_shutdown(self):
        """Test that lifespan closes database engines on shutdown."""
        mock_app = MagicMock()

        with patch("app.main.get_clump_dir") as mock_get_clump_dir, \
             patch("app.main.close_all_engines", new_callable=AsyncMock) as mock_close:
            async with lifespan(mock_app):
                pass

            mock_close.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_handles_startup_error(self):
        """Test that lifespan handles startup errors gracefully."""
        mock_app = MagicMock()

        with patch("app.main.get_clump_dir", side_effect=Exception("Startup error")), \
             patch("app.main.close_all_engines", new_callable=AsyncMock):
            with pytest.raises(Exception, match="Startup error"):
                async with lifespan(mock_app):
                    pass

    @pytest.mark.asyncio
    async def test_lifespan_cleanup_with_exception(self):
        """Test that lifespan context manager handles exceptions during yield.

        Note: The asynccontextmanager doesn't call cleanup when an exception
        is raised in the with block and not caught inside the context manager.
        This test verifies the behavior matches Python's asynccontextmanager semantics.
        """
        mock_app = MagicMock()

        with patch("app.main.get_clump_dir"):
            # The lifespan context manager doesn't suppress exceptions
            # so cleanup won't be called in this case
            with pytest.raises(RuntimeError, match="App crashed"):
                async with lifespan(mock_app):
                    raise RuntimeError("App crashed")


class TestApiRoutePrefix:
    """Tests to verify all routes use the /api prefix."""

    def test_all_routes_use_api_prefix(self):
        """Test that all registered routes use the /api prefix."""
        client = TestClient(app)

        # Get all routes from the app
        routes = []
        for route in app.routes:
            if hasattr(route, "path"):
                routes.append(route.path)

        # Filter to only API routes (exclude openapi routes)
        api_routes = [r for r in routes if not r.startswith("/openapi") and not r.startswith("/docs") and not r.startswith("/redoc")]

        # Verify all API routes start with /api
        for route in api_routes:
            if route != "/":  # Skip root if any
                assert route.startswith("/api"), f"Route {route} does not start with /api"


class TestOpenAPISchema:
    """Tests for OpenAPI schema generation."""

    def test_openapi_schema_available(self):
        """Test that OpenAPI schema is generated."""
        client = TestClient(app)
        response = client.get("/openapi.json")
        assert response.status_code == 200

        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert schema["info"]["title"] == "Clump"

    def test_openapi_has_paths(self):
        """Test that OpenAPI schema has paths defined."""
        client = TestClient(app)
        response = client.get("/openapi.json")
        schema = response.json()

        assert "paths" in schema
        assert len(schema["paths"]) > 0
        assert "/api/health" in schema["paths"]
