"""
Tests for the commands router API endpoints.

Tests cover:
- GET /commands (list all commands with merging)
- GET /commands/{category}/{command_id} (get specific command)
- POST /commands/{category} (create command)
- PUT /commands/{category}/{command_id} (update command)
- DELETE /commands/{category}/{command_id} (delete command)
- Helper functions (parse_command_file, merge_commands, serialize_command_to_md)
"""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI
import tempfile
import os

from app.routers.commands import (
    router,
    parse_command_file,
    load_commands_from_dir,
    merge_commands,
    serialize_command_to_md,
    CommandMetadata,
    CommandCreate,
)


@pytest.fixture
def app():
    """Create a test FastAPI app with the commands router."""
    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    """Create a test client."""
    return TestClient(app)


@pytest.fixture
def temp_commands_dir():
    """Create a temporary directory structure for testing commands."""
    with tempfile.TemporaryDirectory() as tmpdir:
        commands_dir = Path(tmpdir) / ".claude" / "commands"

        # Create issue directory
        issue_dir = commands_dir / "issue"
        issue_dir.mkdir(parents=True)

        # Create pr directory
        pr_dir = commands_dir / "pr"
        pr_dir.mkdir(parents=True)

        yield commands_dir


@pytest.fixture
def sample_command_content():
    """Sample command file content with valid YAML frontmatter."""
    return """---
name: Test Command
shortName: Test
description: A test command for testing
---

This is the template content with {{placeholder}}.
"""


@pytest.fixture
def sample_command_file(temp_commands_dir, sample_command_content):
    """Create a sample command file."""
    file_path = temp_commands_dir / "issue" / "test-command.md"
    file_path.write_text(sample_command_content)
    return file_path


class TestParseCommandFile:
    """Tests for parse_command_file function."""

    def test_parse_valid_command_file(self, sample_command_file):
        """Test parsing a valid command file with frontmatter."""
        result = parse_command_file(sample_command_file, "issue", "builtin")

        assert result is not None
        assert result.id == "test-command"
        assert result.name == "Test Command"
        assert result.shortName == "Test"
        assert result.description == "A test command for testing"
        assert result.category == "issue"
        assert result.source == "builtin"
        assert "{{placeholder}}" in result.template

    def test_parse_file_without_frontmatter(self, temp_commands_dir):
        """Test parsing a file without YAML frontmatter returns None."""
        file_path = temp_commands_dir / "issue" / "no-frontmatter.md"
        file_path.write_text("Just regular markdown content")

        result = parse_command_file(file_path, "issue")
        assert result is None

    def test_parse_file_with_invalid_frontmatter(self, temp_commands_dir):
        """Test parsing a file with incomplete frontmatter returns None."""
        file_path = temp_commands_dir / "issue" / "invalid.md"
        file_path.write_text("---\nname: Only Name\n---\nContent")

        result = parse_command_file(file_path, "issue")
        assert result is None

    def test_parse_file_with_empty_frontmatter(self, temp_commands_dir):
        """Test parsing a file with empty frontmatter returns None."""
        file_path = temp_commands_dir / "issue" / "empty-fm.md"
        file_path.write_text("---\n---\nContent")

        result = parse_command_file(file_path, "issue")
        assert result is None

    def test_parse_file_with_incomplete_yaml_block(self, temp_commands_dir):
        """Test parsing a file with only opening --- returns None."""
        file_path = temp_commands_dir / "issue" / "incomplete.md"
        file_path.write_text("---\nname: Test\n")

        result = parse_command_file(file_path, "issue")
        assert result is None

    def test_parse_file_with_repo_source(self, sample_command_file):
        """Test parsing with repo source."""
        result = parse_command_file(sample_command_file, "issue", "repo")

        assert result is not None
        assert result.source == "repo"

    def test_parse_nonexistent_file(self, temp_commands_dir):
        """Test parsing a nonexistent file returns None."""
        file_path = temp_commands_dir / "issue" / "does-not-exist.md"
        result = parse_command_file(file_path, "issue")
        assert result is None


class TestLoadCommandsFromDir:
    """Tests for load_commands_from_dir function."""

    def test_load_commands_from_empty_dir(self, temp_commands_dir):
        """Test loading from a directory with no command files."""
        result = load_commands_from_dir(temp_commands_dir, "issue")
        assert result == []

    def test_load_commands_from_nonexistent_dir(self, temp_commands_dir):
        """Test loading from a nonexistent category directory."""
        result = load_commands_from_dir(temp_commands_dir, "nonexistent")
        assert result == []

    def test_load_single_command(self, temp_commands_dir, sample_command_content):
        """Test loading a single command file."""
        (temp_commands_dir / "issue" / "my-command.md").write_text(sample_command_content)

        result = load_commands_from_dir(temp_commands_dir, "issue")

        assert len(result) == 1
        assert result[0].id == "my-command"
        assert result[0].name == "Test Command"

    def test_load_multiple_commands(self, temp_commands_dir):
        """Test loading multiple command files."""
        for i in range(3):
            content = f"""---
name: Command {i}
shortName: Cmd{i}
description: Description {i}
---

Template {i}
"""
            (temp_commands_dir / "pr" / f"command-{i}.md").write_text(content)

        result = load_commands_from_dir(temp_commands_dir, "pr")

        assert len(result) == 3
        # Commands should be sorted by filename
        assert result[0].id == "command-0"
        assert result[1].id == "command-1"
        assert result[2].id == "command-2"

    def test_load_skips_invalid_files(self, temp_commands_dir, sample_command_content):
        """Test that invalid files are skipped."""
        (temp_commands_dir / "issue" / "valid.md").write_text(sample_command_content)
        (temp_commands_dir / "issue" / "invalid.md").write_text("no frontmatter")

        result = load_commands_from_dir(temp_commands_dir, "issue")

        assert len(result) == 1
        assert result[0].id == "valid"


class TestMergeCommands:
    """Tests for merge_commands function."""

    def test_merge_empty_lists(self):
        """Test merging two empty lists."""
        result = merge_commands([], [])
        assert result == []

    def test_merge_builtin_only(self):
        """Test merging with only builtin commands."""
        builtin = [
            CommandMetadata(
                id="cmd1", name="Cmd1", shortName="C1",
                description="Desc1", category="issue", template="T1", source="builtin"
            ),
        ]

        result = merge_commands(builtin, [])

        assert len(result) == 1
        assert result[0].id == "cmd1"
        assert result[0].source == "builtin"

    def test_merge_repo_only(self):
        """Test merging with only repo commands."""
        repo = [
            CommandMetadata(
                id="cmd1", name="Cmd1", shortName="C1",
                description="Desc1", category="issue", template="T1", source="repo"
            ),
        ]

        result = merge_commands([], repo)

        assert len(result) == 1
        assert result[0].source == "repo"

    def test_merge_repo_overrides_builtin(self):
        """Test that repo commands override builtin commands with same ID."""
        builtin = [
            CommandMetadata(
                id="shared", name="Builtin Name", shortName="BN",
                description="Builtin Desc", category="issue", template="Builtin", source="builtin"
            ),
        ]
        repo = [
            CommandMetadata(
                id="shared", name="Repo Name", shortName="RN",
                description="Repo Desc", category="issue", template="Repo", source="repo"
            ),
        ]

        result = merge_commands(builtin, repo)

        assert len(result) == 1
        assert result[0].name == "Repo Name"
        assert result[0].source == "repo"

    def test_merge_combines_unique_commands(self):
        """Test merging combines unique commands from both sources."""
        builtin = [
            CommandMetadata(
                id="builtin-only", name="Builtin", shortName="B",
                description="B Desc", category="issue", template="B", source="builtin"
            ),
        ]
        repo = [
            CommandMetadata(
                id="repo-only", name="Repo", shortName="R",
                description="R Desc", category="issue", template="R", source="repo"
            ),
        ]

        result = merge_commands(builtin, repo)

        assert len(result) == 2
        ids = {cmd.id for cmd in result}
        assert ids == {"builtin-only", "repo-only"}


class TestSerializeCommandToMd:
    """Tests for serialize_command_to_md function."""

    def test_serialize_basic_command(self):
        """Test serializing a basic command to markdown."""
        command = CommandCreate(
            name="My Command",
            shortName="MC",
            description="My description",
            template="Hello {{name}}!"
        )

        result = serialize_command_to_md(command)

        assert "---" in result
        assert "name: My Command" in result
        assert "shortName: MC" in result
        assert "description: My description" in result
        assert "Hello {{name}}!" in result

    def test_serialize_command_with_multiline_template(self):
        """Test serializing a command with a multiline template."""
        command = CommandCreate(
            name="Multi",
            shortName="M",
            description="Multi line",
            template="Line 1\nLine 2\nLine 3"
        )

        result = serialize_command_to_md(command)

        assert "Line 1\nLine 2\nLine 3" in result

    def test_serialize_roundtrip(self, temp_commands_dir):
        """Test that serialize then parse returns equivalent data."""
        command = CommandCreate(
            name="Roundtrip Test",
            shortName="RT",
            description="Testing roundtrip",
            template="Template content here"
        )

        serialized = serialize_command_to_md(command)
        file_path = temp_commands_dir / "issue" / "roundtrip.md"
        file_path.write_text(serialized)

        parsed = parse_command_file(file_path, "issue")

        assert parsed is not None
        assert parsed.name == command.name
        assert parsed.shortName == command.shortName
        assert parsed.description == command.description
        assert parsed.template == command.template


class TestGetCommandsEndpoint:
    """Tests for GET /commands endpoint."""

    def test_get_commands_returns_builtin_only(self, client, temp_commands_dir, sample_command_content):
        """Test getting commands without repo path returns builtin only."""
        (temp_commands_dir / "issue" / "builtin-cmd.md").write_text(sample_command_content)

        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.get("/commands")

        assert response.status_code == 200
        data = response.json()
        assert "issue" in data
        assert "pr" in data
        assert len(data["issue"]) == 1
        assert data["issue"][0]["id"] == "builtin-cmd"
        assert data["issue"][0]["source"] == "builtin"

    def test_get_commands_with_repo_path(self, client, temp_commands_dir, sample_command_content):
        """Test getting commands with repo path merges repo commands."""
        # Create builtin commands directory
        with tempfile.TemporaryDirectory() as builtin_tmpdir:
            builtin_dir = Path(builtin_tmpdir) / ".claude" / "commands"
            (builtin_dir / "issue").mkdir(parents=True)
            (builtin_dir / "pr").mkdir(parents=True)
            (builtin_dir / "issue" / "builtin.md").write_text("""---
name: Builtin Command
shortName: BC
description: Builtin
---

Builtin template
""")

            # Create repo commands
            (temp_commands_dir / "issue" / "repo-cmd.md").write_text(sample_command_content)

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=builtin_dir), \
                 patch('app.routers.commands.get_repo_commands_dir', return_value=temp_commands_dir):
                response = client.get("/commands", params={"repo_path": "/some/repo"})

        assert response.status_code == 200
        data = response.json()
        assert len(data["issue"]) == 2

    def test_get_commands_repo_overrides_builtin(self, client):
        """Test that repo commands with same ID override builtin."""
        with tempfile.TemporaryDirectory() as builtin_tmpdir, \
             tempfile.TemporaryDirectory() as repo_tmpdir:
            builtin_dir = Path(builtin_tmpdir) / ".claude" / "commands"
            repo_dir = Path(repo_tmpdir) / ".claude" / "commands"

            (builtin_dir / "issue").mkdir(parents=True)
            (builtin_dir / "pr").mkdir(parents=True)
            (repo_dir / "issue").mkdir(parents=True)
            (repo_dir / "pr").mkdir(parents=True)

            # Same ID in both
            (builtin_dir / "issue" / "shared.md").write_text("""---
name: Builtin Version
shortName: BV
description: Builtin desc
---

Builtin template
""")
            (repo_dir / "issue" / "shared.md").write_text("""---
name: Repo Version
shortName: RV
description: Repo desc
---

Repo template
""")

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=builtin_dir), \
                 patch('app.routers.commands.get_repo_commands_dir', return_value=repo_dir):
                response = client.get("/commands", params={"repo_path": "/some/repo"})

        assert response.status_code == 200
        data = response.json()
        assert len(data["issue"]) == 1
        assert data["issue"][0]["name"] == "Repo Version"
        assert data["issue"][0]["source"] == "repo"


class TestGetCommandEndpoint:
    """Tests for GET /commands/{category}/{command_id} endpoint."""

    def test_get_specific_command(self, client, temp_commands_dir, sample_command_content):
        """Test getting a specific command by ID."""
        (temp_commands_dir / "issue" / "my-cmd.md").write_text(sample_command_content)

        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.get("/commands/issue/my-cmd")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "my-cmd"
        assert data["name"] == "Test Command"

    def test_get_command_invalid_category(self, client):
        """Test getting command with invalid category returns 400."""
        response = client.get("/commands/invalid/some-cmd")

        assert response.status_code == 400
        assert "issue" in response.json()["detail"] or "pr" in response.json()["detail"]

    def test_get_command_not_found(self, client, temp_commands_dir):
        """Test getting nonexistent command returns 404."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.get("/commands/issue/nonexistent")

        assert response.status_code == 404

    def test_get_command_prefers_repo(self, client):
        """Test getting command prefers repo over builtin."""
        with tempfile.TemporaryDirectory() as builtin_tmpdir, \
             tempfile.TemporaryDirectory() as repo_tmpdir:
            builtin_dir = Path(builtin_tmpdir) / ".claude" / "commands"
            repo_dir = Path(repo_tmpdir) / ".claude" / "commands"

            (builtin_dir / "issue").mkdir(parents=True)
            (repo_dir / "issue").mkdir(parents=True)

            (builtin_dir / "issue" / "cmd.md").write_text("""---
name: Builtin
shortName: B
description: Builtin
---

Builtin
""")
            (repo_dir / "issue" / "cmd.md").write_text("""---
name: Repo
shortName: R
description: Repo
---

Repo
""")

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=builtin_dir), \
                 patch('app.routers.commands.get_repo_commands_dir', return_value=repo_dir):
                response = client.get("/commands/issue/cmd", params={"repo_path": "/some/repo"})

        assert response.status_code == 200
        assert response.json()["name"] == "Repo"
        assert response.json()["source"] == "repo"


class TestCreateCommandEndpoint:
    """Tests for POST /commands/{category} endpoint."""

    def test_create_command_success(self, client, temp_commands_dir):
        """Test successfully creating a new command."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.post("/commands/issue", json={
                "name": "New Command",
                "shortName": "NC",
                "description": "A new command",
                "template": "New template"
            })

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "new-command"
        assert data["name"] == "New Command"
        assert data["source"] == "builtin"

        # Verify file was created
        created_file = temp_commands_dir / "issue" / "new-command.md"
        assert created_file.exists()

    def test_create_command_in_repo(self, client, temp_commands_dir):
        """Test creating a command in a repo directory."""
        with patch('app.routers.commands.get_repo_commands_dir', return_value=temp_commands_dir):
            response = client.post("/commands/pr", json={
                "name": "Repo Command",
                "shortName": "RC",
                "description": "Repo command",
                "template": "Repo template"
            }, params={"repo_path": "/some/repo"})

        assert response.status_code == 200
        assert response.json()["source"] == "repo"

    def test_create_command_invalid_category(self, client):
        """Test creating command with invalid category returns 400."""
        response = client.post("/commands/invalid", json={
            "name": "Test",
            "shortName": "T",
            "description": "Test",
            "template": "Test"
        })

        assert response.status_code == 400

    def test_create_command_already_exists(self, client, temp_commands_dir, sample_command_content):
        """Test creating command that already exists returns 409."""
        (temp_commands_dir / "issue" / "existing.md").write_text(sample_command_content)

        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.post("/commands/issue", json={
                "name": "Existing",
                "shortName": "E",
                "description": "Existing",
                "template": "Existing"
            })

        assert response.status_code == 409

    def test_create_command_slugifies_name(self, client, temp_commands_dir):
        """Test that command ID is slugified from name."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.post("/commands/issue", json={
                "name": "My Special Command!",
                "shortName": "MSC",
                "description": "Special",
                "template": "Template"
            })

        assert response.status_code == 200
        assert response.json()["id"] == "my-special-command"


class TestUpdateCommandEndpoint:
    """Tests for PUT /commands/{category}/{command_id} endpoint."""

    def test_update_command_success(self, client, temp_commands_dir, sample_command_content):
        """Test successfully updating a command."""
        (temp_commands_dir / "issue" / "to-update.md").write_text(sample_command_content)

        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.put("/commands/issue/to-update", json={
                "name": "Updated Name",
                "shortName": "UN",
                "description": "Updated description",
                "template": "Updated template"
            })

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"

        # Verify file was updated
        updated_content = (temp_commands_dir / "issue" / "to-update.md").read_text()
        assert "Updated Name" in updated_content

    def test_update_command_invalid_category(self, client):
        """Test updating with invalid category returns 400."""
        response = client.put("/commands/invalid/cmd", json={
            "name": "Test",
            "shortName": "T",
            "description": "Test",
            "template": "Test"
        })

        assert response.status_code == 400

    def test_update_command_not_found(self, client, temp_commands_dir):
        """Test updating nonexistent command returns 404."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.put("/commands/issue/nonexistent", json={
                "name": "Test",
                "shortName": "T",
                "description": "Test",
                "template": "Test"
            })

        assert response.status_code == 404

    def test_update_prefers_repo_command(self, client):
        """Test that update modifies repo command if it exists."""
        with tempfile.TemporaryDirectory() as builtin_tmpdir, \
             tempfile.TemporaryDirectory() as repo_tmpdir:
            builtin_dir = Path(builtin_tmpdir) / ".claude" / "commands"
            repo_dir = Path(repo_tmpdir) / ".claude" / "commands"

            (builtin_dir / "issue").mkdir(parents=True)
            (repo_dir / "issue").mkdir(parents=True)

            (builtin_dir / "issue" / "cmd.md").write_text("""---
name: Builtin
shortName: B
description: Builtin
---

Builtin
""")
            (repo_dir / "issue" / "cmd.md").write_text("""---
name: Repo
shortName: R
description: Repo
---

Repo
""")

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=builtin_dir), \
                 patch('app.routers.commands.get_repo_commands_dir', return_value=repo_dir):
                response = client.put("/commands/issue/cmd", json={
                    "name": "Updated",
                    "shortName": "U",
                    "description": "Updated",
                    "template": "Updated"
                }, params={"repo_path": "/some/repo"})

            assert response.status_code == 200
            assert response.json()["source"] == "repo"

            # Verify repo file was updated, not builtin
            repo_content = (repo_dir / "issue" / "cmd.md").read_text()
            assert "Updated" in repo_content

            builtin_content = (builtin_dir / "issue" / "cmd.md").read_text()
            assert "Builtin" in builtin_content


class TestDeleteCommandEndpoint:
    """Tests for DELETE /commands/{category}/{command_id} endpoint."""

    def test_delete_command_success(self, client, temp_commands_dir, sample_command_content):
        """Test successfully deleting a command."""
        file_path = temp_commands_dir / "issue" / "to-delete.md"
        file_path.write_text(sample_command_content)

        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.delete("/commands/issue/to-delete")

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"
        assert not file_path.exists()

    def test_delete_command_invalid_category(self, client):
        """Test deleting with invalid category returns 400."""
        response = client.delete("/commands/invalid/cmd")

        assert response.status_code == 400

    def test_delete_command_not_found(self, client, temp_commands_dir):
        """Test deleting nonexistent command returns 404."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.delete("/commands/issue/nonexistent")

        assert response.status_code == 404

    def test_delete_prefers_repo_command(self, client):
        """Test that delete removes repo command if it exists."""
        with tempfile.TemporaryDirectory() as builtin_tmpdir, \
             tempfile.TemporaryDirectory() as repo_tmpdir:
            builtin_dir = Path(builtin_tmpdir) / ".claude" / "commands"
            repo_dir = Path(repo_tmpdir) / ".claude" / "commands"

            (builtin_dir / "issue").mkdir(parents=True)
            (repo_dir / "issue").mkdir(parents=True)

            builtin_file = builtin_dir / "issue" / "cmd.md"
            repo_file = repo_dir / "issue" / "cmd.md"

            builtin_file.write_text("""---
name: Builtin
shortName: B
description: Builtin
---

Builtin
""")
            repo_file.write_text("""---
name: Repo
shortName: R
description: Repo
---

Repo
""")

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=builtin_dir), \
                 patch('app.routers.commands.get_repo_commands_dir', return_value=repo_dir):
                response = client.delete("/commands/issue/cmd", params={"repo_path": "/some/repo"})

            assert response.status_code == 200

            # Verify repo file was deleted, builtin remains
            assert not repo_file.exists()
            assert builtin_file.exists()


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_command_with_special_characters_in_template(self, temp_commands_dir):
        """Test commands with special characters in template."""
        content = """---
name: Special Chars
shortName: SC
description: Has special chars
---

Template with `code` and **bold** and "quotes" and 'apostrophes'.
Also has $variables and {{placeholders}} and [links](url).
"""
        file_path = temp_commands_dir / "issue" / "special.md"
        file_path.write_text(content)

        result = parse_command_file(file_path, "issue")

        assert result is not None
        assert "`code`" in result.template
        assert "**bold**" in result.template
        assert "{{placeholders}}" in result.template

    def test_command_with_unicode(self, temp_commands_dir):
        """Test commands with unicode characters."""
        content = """---
name: Unicode Test 🎉
shortName: UT
description: Description with émojis and ünicode
---

Template with 日本語 and العربية and Ελληνικά.
"""
        file_path = temp_commands_dir / "issue" / "unicode.md"
        file_path.write_text(content)

        result = parse_command_file(file_path, "issue")

        assert result is not None
        assert "🎉" in result.name
        assert "日本語" in result.template

    def test_empty_commands_directories(self, client, temp_commands_dir):
        """Test endpoint with empty commands directories."""
        with patch('app.routers.commands.get_builtin_commands_dir', return_value=temp_commands_dir):
            response = client.get("/commands")

        assert response.status_code == 200
        data = response.json()
        assert data["issue"] == []
        assert data["pr"] == []

    def test_create_command_creates_directory(self, client):
        """Test that creating a command creates the category directory if needed."""
        with tempfile.TemporaryDirectory() as tmpdir:
            commands_dir = Path(tmpdir) / ".claude" / "commands"
            # Don't create directories - let the endpoint do it

            with patch('app.routers.commands.get_builtin_commands_dir', return_value=commands_dir):
                response = client.post("/commands/issue", json={
                    "name": "First Command",
                    "shortName": "FC",
                    "description": "First",
                    "template": "First template"
                })

            assert response.status_code == 200
            assert (commands_dir / "issue" / "first-command.md").exists()
