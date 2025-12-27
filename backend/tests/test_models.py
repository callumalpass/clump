"""
Tests for SQLAlchemy models.

Tests cover:
- Model enum definitions
- Model field types and constraints
- Model relationships
- Default values
"""

import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock
from sqlalchemy import inspect
from sqlalchemy.orm import Session as SqlSession

from app.models import (
    SessionKind,
    SessionStatus,
    ActionType,
    Session,
    Action,
    Tag,
    IssueTag,
    SessionEntity,
)
from app.database import Base


class TestSessionKindEnum:
    """Tests for SessionKind enum."""

    def test_session_kind_values(self):
        """Test that SessionKind has correct values."""
        assert SessionKind.ISSUE.value == "issue"
        assert SessionKind.PR.value == "pr"
        assert SessionKind.CODEBASE.value == "codebase"
        assert SessionKind.CUSTOM.value == "custom"

    def test_session_kind_is_string_enum(self):
        """Test that SessionKind is a string enum."""
        assert isinstance(SessionKind.ISSUE, str)
        assert SessionKind.ISSUE == "issue"

    def test_session_kind_all_values(self):
        """Test that SessionKind has exactly 4 values."""
        values = list(SessionKind)
        assert len(values) == 4
        assert set(v.value for v in values) == {"issue", "pr", "codebase", "custom"}


class TestSessionStatusEnum:
    """Tests for SessionStatus enum."""

    def test_session_status_values(self):
        """Test that SessionStatus has correct values."""
        assert SessionStatus.RUNNING.value == "running"
        assert SessionStatus.COMPLETED.value == "completed"
        assert SessionStatus.FAILED.value == "failed"

    def test_session_status_is_string_enum(self):
        """Test that SessionStatus is a string enum."""
        assert isinstance(SessionStatus.RUNNING, str)
        assert SessionStatus.RUNNING == "running"

    def test_session_status_all_values(self):
        """Test that SessionStatus has exactly 3 values."""
        values = list(SessionStatus)
        assert len(values) == 3
        assert set(v.value for v in values) == {"running", "completed", "failed"}


class TestActionTypeEnum:
    """Tests for ActionType enum."""

    def test_action_type_values(self):
        """Test that ActionType has correct values."""
        assert ActionType.COMMENT.value == "comment"
        assert ActionType.LABEL.value == "label"
        assert ActionType.CLOSE.value == "close"
        assert ActionType.BRANCH.value == "branch"
        assert ActionType.PR.value == "pr"

    def test_action_type_is_string_enum(self):
        """Test that ActionType is a string enum."""
        assert isinstance(ActionType.COMMENT, str)
        assert ActionType.COMMENT == "comment"

    def test_action_type_all_values(self):
        """Test that ActionType has exactly 5 values."""
        values = list(ActionType)
        assert len(values) == 5
        assert set(v.value for v in values) == {"comment", "label", "close", "branch", "pr"}


class TestSessionModel:
    """Tests for Session model."""

    def test_session_tablename(self):
        """Test that Session has correct table name."""
        assert Session.__tablename__ == "sessions"

    def test_session_is_sqlalchemy_model(self):
        """Test that Session inherits from Base."""
        assert issubclass(Session, Base)

    def test_session_has_required_columns(self):
        """Test that Session has all required columns."""
        mapper = inspect(Session)
        column_names = [c.key for c in mapper.columns]

        required = [
            "id", "repo_id", "kind", "title", "prompt", "transcript",
            "summary", "status", "process_id", "claude_session_id",
            "created_at", "completed_at"
        ]

        for col in required:
            assert col in column_names, f"Missing column: {col}"

    def test_session_has_relationships(self):
        """Test that Session has defined relationships."""
        mapper = inspect(Session)
        relationship_names = [r.key for r in mapper.relationships]

        assert "actions" in relationship_names
        assert "entities" in relationship_names

    def test_session_column_types(self):
        """Test Session column types are correct."""
        mapper = inspect(Session)
        columns = {c.key: c for c in mapper.columns}

        # Check primary key
        assert columns["id"].primary_key is True

        # Check string types have length limits
        assert columns["kind"].type.length == 50
        assert columns["title"].type.length == 500
        assert columns["status"].type.length == 50
        assert columns["process_id"].type.length == 100
        assert columns["claude_session_id"].type.length == 100

    def test_session_nullable_columns(self):
        """Test Session nullable columns are correct."""
        mapper = inspect(Session)
        columns = {c.key: c for c in mapper.columns}

        # These should be nullable
        assert columns["summary"].nullable is True
        assert columns["process_id"].nullable is True
        assert columns["claude_session_id"].nullable is True
        assert columns["completed_at"].nullable is True

        # These should not be nullable (required)
        assert columns["id"].nullable is False
        assert columns["repo_id"].nullable is False
        assert columns["kind"].nullable is False
        assert columns["title"].nullable is False
        assert columns["prompt"].nullable is False


class TestActionModel:
    """Tests for Action model."""

    def test_action_tablename(self):
        """Test that Action has correct table name."""
        assert Action.__tablename__ == "actions"

    def test_action_is_sqlalchemy_model(self):
        """Test that Action inherits from Base."""
        assert issubclass(Action, Base)

    def test_action_has_required_columns(self):
        """Test that Action has all required columns."""
        mapper = inspect(Action)
        column_names = [c.key for c in mapper.columns]

        required = ["id", "session_id", "type", "payload", "status", "created_at"]

        for col in required:
            assert col in column_names, f"Missing column: {col}"

    def test_action_has_session_relationship(self):
        """Test that Action has session relationship."""
        mapper = inspect(Action)
        relationship_names = [r.key for r in mapper.relationships]

        assert "session" in relationship_names

    def test_action_foreign_key(self):
        """Test that Action has foreign key to Session."""
        mapper = inspect(Action)
        columns = {c.key: c for c in mapper.columns}

        # Check foreign key exists
        fk_names = [fk.column.name for fk in columns["session_id"].foreign_keys]
        assert "id" in fk_names

    def test_action_column_types(self):
        """Test Action column types are correct."""
        mapper = inspect(Action)
        columns = {c.key: c for c in mapper.columns}

        assert columns["id"].primary_key is True
        assert columns["type"].type.length == 50
        assert columns["status"].type.length == 50


class TestTagModel:
    """Tests for Tag model."""

    def test_tag_tablename(self):
        """Test that Tag has correct table name."""
        assert Tag.__tablename__ == "tags"

    def test_tag_is_sqlalchemy_model(self):
        """Test that Tag inherits from Base."""
        assert issubclass(Tag, Base)

    def test_tag_has_required_columns(self):
        """Test that Tag has all required columns."""
        mapper = inspect(Tag)
        column_names = [c.key for c in mapper.columns]

        required = ["id", "repo_id", "name", "color", "created_at"]

        for col in required:
            assert col in column_names, f"Missing column: {col}"

    def test_tag_has_issue_tags_relationship(self):
        """Test that Tag has issue_tags relationship."""
        mapper = inspect(Tag)
        relationship_names = [r.key for r in mapper.relationships]

        assert "issue_tags" in relationship_names

    def test_tag_column_types(self):
        """Test Tag column types are correct."""
        mapper = inspect(Tag)
        columns = {c.key: c for c in mapper.columns}

        assert columns["id"].primary_key is True
        assert columns["name"].type.length == 100
        assert columns["color"].type.length == 7  # hex color e.g. #ff0000

    def test_tag_color_nullable(self):
        """Test that Tag color is nullable."""
        mapper = inspect(Tag)
        columns = {c.key: c for c in mapper.columns}

        assert columns["color"].nullable is True


class TestIssueTagModel:
    """Tests for IssueTag model (junction table)."""

    def test_issue_tag_tablename(self):
        """Test that IssueTag has correct table name."""
        assert IssueTag.__tablename__ == "issue_tags"

    def test_issue_tag_is_sqlalchemy_model(self):
        """Test that IssueTag inherits from Base."""
        assert issubclass(IssueTag, Base)

    def test_issue_tag_has_required_columns(self):
        """Test that IssueTag has all required columns."""
        mapper = inspect(IssueTag)
        column_names = [c.key for c in mapper.columns]

        required = ["id", "tag_id", "repo_id", "issue_number", "created_at"]

        for col in required:
            assert col in column_names, f"Missing column: {col}"

    def test_issue_tag_has_tag_relationship(self):
        """Test that IssueTag has tag relationship."""
        mapper = inspect(IssueTag)
        relationship_names = [r.key for r in mapper.relationships]

        assert "tag" in relationship_names

    def test_issue_tag_foreign_key(self):
        """Test that IssueTag has foreign key to Tag."""
        mapper = inspect(IssueTag)
        columns = {c.key: c for c in mapper.columns}

        # Check foreign key exists
        fk_names = [fk.column.name for fk in columns["tag_id"].foreign_keys]
        assert "id" in fk_names


class TestSessionEntityModel:
    """Tests for SessionEntity model (junction table)."""

    def test_session_entity_tablename(self):
        """Test that SessionEntity has correct table name."""
        assert SessionEntity.__tablename__ == "session_entities"

    def test_session_entity_is_sqlalchemy_model(self):
        """Test that SessionEntity inherits from Base."""
        assert issubclass(SessionEntity, Base)

    def test_session_entity_has_required_columns(self):
        """Test that SessionEntity has all required columns."""
        mapper = inspect(SessionEntity)
        column_names = [c.key for c in mapper.columns]

        required = ["id", "session_id", "repo_id", "entity_kind", "entity_number", "created_at"]

        for col in required:
            assert col in column_names, f"Missing column: {col}"

    def test_session_entity_has_session_relationship(self):
        """Test that SessionEntity has session relationship."""
        mapper = inspect(SessionEntity)
        relationship_names = [r.key for r in mapper.relationships]

        assert "session" in relationship_names

    def test_session_entity_foreign_key(self):
        """Test that SessionEntity has foreign key to Session."""
        mapper = inspect(SessionEntity)
        columns = {c.key: c for c in mapper.columns}

        # Check foreign key exists
        fk_names = [fk.column.name for fk in columns["session_id"].foreign_keys]
        assert "id" in fk_names

    def test_session_entity_column_types(self):
        """Test SessionEntity column types are correct."""
        mapper = inspect(SessionEntity)
        columns = {c.key: c for c in mapper.columns}

        assert columns["id"].primary_key is True
        assert columns["entity_kind"].type.length == 50


class TestModelCascadeDelete:
    """Tests for cascade delete behavior."""

    def test_session_actions_cascade(self):
        """Test that Session.actions has cascade delete configured."""
        mapper = inspect(Session)
        relationships = {r.key: r for r in mapper.relationships}

        actions_rel = relationships["actions"]
        assert "delete-orphan" in actions_rel.cascade

    def test_session_entities_cascade(self):
        """Test that Session.entities has cascade delete configured."""
        mapper = inspect(Session)
        relationships = {r.key: r for r in mapper.relationships}

        entities_rel = relationships["entities"]
        assert "delete-orphan" in entities_rel.cascade

    def test_tag_issue_tags_cascade(self):
        """Test that Tag.issue_tags has cascade delete configured."""
        mapper = inspect(Tag)
        relationships = {r.key: r for r in mapper.relationships}

        issue_tags_rel = relationships["issue_tags"]
        assert "delete-orphan" in issue_tags_rel.cascade


class TestModelBackPopulates:
    """Tests for back_populates relationship configuration."""

    def test_session_action_backref(self):
        """Test Session-Action bidirectional relationship."""
        session_mapper = inspect(Session)
        action_mapper = inspect(Action)

        session_rels = {r.key: r for r in session_mapper.relationships}
        action_rels = {r.key: r for r in action_mapper.relationships}

        # Session.actions should back_populate to Action.session
        assert session_rels["actions"].back_populates == "session"
        assert action_rels["session"].back_populates == "actions"

    def test_session_entity_backref(self):
        """Test Session-SessionEntity bidirectional relationship."""
        session_mapper = inspect(Session)
        entity_mapper = inspect(SessionEntity)

        session_rels = {r.key: r for r in session_mapper.relationships}
        entity_rels = {r.key: r for r in entity_mapper.relationships}

        assert session_rels["entities"].back_populates == "session"
        assert entity_rels["session"].back_populates == "entities"

    def test_tag_issue_tag_backref(self):
        """Test Tag-IssueTag bidirectional relationship."""
        tag_mapper = inspect(Tag)
        issue_tag_mapper = inspect(IssueTag)

        tag_rels = {r.key: r for r in tag_mapper.relationships}
        issue_tag_rels = {r.key: r for r in issue_tag_mapper.relationships}

        assert tag_rels["issue_tags"].back_populates == "tag"
        assert issue_tag_rels["tag"].back_populates == "issue_tags"
