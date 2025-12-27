"""
Tests for Pydantic schemas.

Tests cover:
- Schema instantiation with valid data
- Default values
- Required vs optional fields
- Nested schema validation
- Type coercion and validation
"""

import pytest
from pydantic import ValidationError

from app.schemas import (
    EntityLinkResponse,
    AddEntityRequest,
    SessionMetadataResponse,
    SessionMetadataUpdate,
    SessionSummaryResponse,
    SessionListResponse,
    ToolUseResponse,
    TokenUsageResponse,
    TranscriptMessageResponse,
    SessionDetailResponse,
    SubsessionDetailResponse,
)


class TestEntityLinkResponse:
    """Tests for EntityLinkResponse schema."""

    def test_valid_issue_entity(self):
        """Test creating a valid issue entity link."""
        entity = EntityLinkResponse(kind="issue", number=42)
        assert entity.kind == "issue"
        assert entity.number == 42

    def test_valid_pr_entity(self):
        """Test creating a valid PR entity link."""
        entity = EntityLinkResponse(kind="pr", number=123)
        assert entity.kind == "pr"
        assert entity.number == 123

    def test_missing_kind_raises_error(self):
        """Test that missing kind raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            EntityLinkResponse(number=42)
        assert "kind" in str(exc_info.value)

    def test_missing_number_raises_error(self):
        """Test that missing number raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            EntityLinkResponse(kind="issue")
        assert "number" in str(exc_info.value)

    def test_invalid_number_type_raises_error(self):
        """Test that invalid number type raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            EntityLinkResponse(kind="issue", number="not-a-number")
        assert "number" in str(exc_info.value)

    def test_model_dump(self):
        """Test model serialization."""
        entity = EntityLinkResponse(kind="issue", number=42)
        data = entity.model_dump()
        assert data == {"kind": "issue", "number": 42}

    def test_model_from_dict(self):
        """Test model creation from dict."""
        data = {"kind": "pr", "number": 99}
        entity = EntityLinkResponse(**data)
        assert entity.kind == "pr"
        assert entity.number == 99


class TestAddEntityRequest:
    """Tests for AddEntityRequest schema."""

    def test_valid_add_entity_request(self):
        """Test creating a valid add entity request."""
        request = AddEntityRequest(kind="issue", number=1)
        assert request.kind == "issue"
        assert request.number == 1

    def test_missing_fields_raises_error(self):
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            AddEntityRequest()

    def test_number_coercion(self):
        """Test that string numbers are coerced to int."""
        request = AddEntityRequest(kind="pr", number="123")
        assert request.number == 123


class TestSessionMetadataResponse:
    """Tests for SessionMetadataResponse schema."""

    def test_minimal_valid_metadata(self):
        """Test creating metadata with only required fields."""
        metadata = SessionMetadataResponse(session_id="test-uuid")
        assert metadata.session_id == "test-uuid"
        assert metadata.title is None
        assert metadata.summary is None
        assert metadata.repo_path is None
        assert metadata.entities == []
        assert metadata.tags == []
        assert metadata.starred is False
        assert metadata.created_at is None

    def test_full_metadata(self):
        """Test creating metadata with all fields."""
        entities = [
            EntityLinkResponse(kind="issue", number=1),
            EntityLinkResponse(kind="pr", number=2),
        ]
        metadata = SessionMetadataResponse(
            session_id="test-uuid",
            title="Test Session",
            summary="A test session",
            repo_path="/home/user/project",
            entities=entities,
            tags=["tag1", "tag2"],
            starred=True,
            created_at="2024-01-01T00:00:00Z",
        )
        assert metadata.session_id == "test-uuid"
        assert metadata.title == "Test Session"
        assert metadata.summary == "A test session"
        assert metadata.repo_path == "/home/user/project"
        assert len(metadata.entities) == 2
        assert metadata.tags == ["tag1", "tag2"]
        assert metadata.starred is True
        assert metadata.created_at == "2024-01-01T00:00:00Z"

    def test_missing_session_id_raises_error(self):
        """Test that missing session_id raises validation error."""
        with pytest.raises(ValidationError) as exc_info:
            SessionMetadataResponse()
        assert "session_id" in str(exc_info.value)

    def test_nested_entity_validation(self):
        """Test that nested entities are validated."""
        with pytest.raises(ValidationError):
            SessionMetadataResponse(
                session_id="test-uuid",
                entities=[{"invalid": "data"}],
            )

    def test_entities_from_dicts(self):
        """Test that entities can be created from dicts."""
        metadata = SessionMetadataResponse(
            session_id="test-uuid",
            entities=[{"kind": "issue", "number": 1}],
        )
        assert len(metadata.entities) == 1
        assert metadata.entities[0].kind == "issue"
        assert metadata.entities[0].number == 1


class TestSessionMetadataUpdate:
    """Tests for SessionMetadataUpdate schema."""

    def test_empty_update(self):
        """Test creating an empty update (all fields optional)."""
        update = SessionMetadataUpdate()
        assert update.title is None
        assert update.summary is None
        assert update.tags is None
        assert update.starred is None

    def test_partial_update(self):
        """Test creating a partial update."""
        update = SessionMetadataUpdate(title="New Title")
        assert update.title == "New Title"
        assert update.summary is None
        assert update.tags is None
        assert update.starred is None

    def test_full_update(self):
        """Test creating a full update."""
        update = SessionMetadataUpdate(
            title="New Title",
            summary="New Summary",
            tags=["new", "tags"],
            starred=True,
        )
        assert update.title == "New Title"
        assert update.summary == "New Summary"
        assert update.tags == ["new", "tags"]
        assert update.starred is True

    def test_model_dump_exclude_unset(self):
        """Test that model_dump excludes unset fields."""
        update = SessionMetadataUpdate(title="New Title")
        data = update.model_dump(exclude_unset=True)
        assert data == {"title": "New Title"}


class TestSessionSummaryResponse:
    """Tests for SessionSummaryResponse schema."""

    def test_minimal_valid_summary(self):
        """Test creating summary with only required fields."""
        summary = SessionSummaryResponse(
            session_id="test-uuid",
            encoded_path="encoded%2Fpath",
            repo_path="/home/user/project",
            modified_at="2024-01-01T00:00:00Z",
            file_size=1024,
        )
        assert summary.session_id == "test-uuid"
        assert summary.encoded_path == "encoded%2Fpath"
        assert summary.repo_path == "/home/user/project"
        assert summary.repo_name is None
        assert summary.title is None
        assert summary.model is None
        assert summary.start_time is None
        assert summary.end_time is None
        assert summary.message_count == 0
        assert summary.modified_at == "2024-01-01T00:00:00Z"
        assert summary.file_size == 1024
        assert summary.entities == []
        assert summary.tags == []
        assert summary.starred is False
        assert summary.is_active is False

    def test_full_summary(self):
        """Test creating summary with all fields."""
        summary = SessionSummaryResponse(
            session_id="test-uuid",
            encoded_path="encoded%2Fpath",
            repo_path="/home/user/project",
            repo_name="owner/repo",
            title="Test Session",
            model="claude-3-opus",
            start_time="2024-01-01T00:00:00Z",
            end_time="2024-01-01T01:00:00Z",
            message_count=10,
            modified_at="2024-01-01T01:00:00Z",
            file_size=2048,
            entities=[EntityLinkResponse(kind="issue", number=1)],
            tags=["tag1"],
            starred=True,
            is_active=True,
        )
        assert summary.session_id == "test-uuid"
        assert summary.repo_name == "owner/repo"
        assert summary.title == "Test Session"
        assert summary.model == "claude-3-opus"
        assert summary.message_count == 10
        assert summary.is_active is True

    def test_missing_required_fields_raises_error(self):
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            SessionSummaryResponse(session_id="test-uuid")


class TestSessionListResponse:
    """Tests for SessionListResponse schema."""

    def test_empty_list(self):
        """Test creating an empty session list."""
        response = SessionListResponse(sessions=[], total=0)
        assert response.sessions == []
        assert response.total == 0

    def test_list_with_sessions(self):
        """Test creating a session list with items."""
        sessions = [
            SessionSummaryResponse(
                session_id="uuid-1",
                encoded_path="path1",
                repo_path="/path1",
                modified_at="2024-01-01T00:00:00Z",
                file_size=1024,
            ),
            SessionSummaryResponse(
                session_id="uuid-2",
                encoded_path="path2",
                repo_path="/path2",
                modified_at="2024-01-02T00:00:00Z",
                file_size=2048,
            ),
        ]
        response = SessionListResponse(sessions=sessions, total=2)
        assert len(response.sessions) == 2
        assert response.total == 2

    def test_total_can_differ_from_list_length(self):
        """Test that total can differ from list length (for pagination)."""
        sessions = [
            SessionSummaryResponse(
                session_id="uuid-1",
                encoded_path="path1",
                repo_path="/path1",
                modified_at="2024-01-01T00:00:00Z",
                file_size=1024,
            ),
        ]
        response = SessionListResponse(sessions=sessions, total=100)
        assert len(response.sessions) == 1
        assert response.total == 100


class TestToolUseResponse:
    """Tests for ToolUseResponse schema."""

    def test_minimal_tool_use(self):
        """Test creating a tool use with required fields only."""
        tool = ToolUseResponse(id="tool-1", name="Read", input={"path": "/file.txt"})
        assert tool.id == "tool-1"
        assert tool.name == "Read"
        assert tool.input == {"path": "/file.txt"}
        assert tool.spawned_agent_id is None

    def test_tool_use_with_spawned_agent(self):
        """Test creating a tool use that spawned an agent."""
        tool = ToolUseResponse(
            id="tool-1",
            name="Task",
            input={"prompt": "Do something"},
            spawned_agent_id="abc1234",
        )
        assert tool.spawned_agent_id == "abc1234"

    def test_empty_input(self):
        """Test creating a tool use with empty input."""
        tool = ToolUseResponse(id="tool-1", name="Health", input={})
        assert tool.input == {}

    def test_complex_input(self):
        """Test creating a tool use with complex nested input."""
        complex_input = {
            "path": "/file.txt",
            "options": {"recursive": True, "depth": 3},
            "filters": ["*.py", "*.ts"],
        }
        tool = ToolUseResponse(id="tool-1", name="Glob", input=complex_input)
        assert tool.input == complex_input


class TestTokenUsageResponse:
    """Tests for TokenUsageResponse schema."""

    def test_default_values(self):
        """Test that all fields default to 0."""
        usage = TokenUsageResponse()
        assert usage.input_tokens == 0
        assert usage.output_tokens == 0
        assert usage.cache_read_tokens == 0
        assert usage.cache_creation_tokens == 0

    def test_full_usage(self):
        """Test creating usage with all fields set."""
        usage = TokenUsageResponse(
            input_tokens=1000,
            output_tokens=500,
            cache_read_tokens=200,
            cache_creation_tokens=100,
        )
        assert usage.input_tokens == 1000
        assert usage.output_tokens == 500
        assert usage.cache_read_tokens == 200
        assert usage.cache_creation_tokens == 100

    def test_partial_usage(self):
        """Test creating usage with some fields set."""
        usage = TokenUsageResponse(input_tokens=100, output_tokens=50)
        assert usage.input_tokens == 100
        assert usage.output_tokens == 50
        assert usage.cache_read_tokens == 0
        assert usage.cache_creation_tokens == 0


class TestTranscriptMessageResponse:
    """Tests for TranscriptMessageResponse schema."""

    def test_minimal_message(self):
        """Test creating a message with required fields only."""
        message = TranscriptMessageResponse(
            uuid="msg-1",
            role="user",
            content="Hello",
            timestamp="2024-01-01T00:00:00Z",
        )
        assert message.uuid == "msg-1"
        assert message.role == "user"
        assert message.content == "Hello"
        assert message.timestamp == "2024-01-01T00:00:00Z"
        assert message.thinking is None
        assert message.tool_uses == []
        assert message.model is None
        assert message.usage is None

    def test_full_message(self):
        """Test creating a message with all fields set."""
        tool_uses = [
            ToolUseResponse(id="tool-1", name="Read", input={"path": "/file.txt"})
        ]
        usage = TokenUsageResponse(input_tokens=100, output_tokens=50)
        message = TranscriptMessageResponse(
            uuid="msg-1",
            role="assistant",
            content="I'll help you with that.",
            timestamp="2024-01-01T00:00:00Z",
            thinking="Let me analyze this...",
            tool_uses=tool_uses,
            model="claude-3-opus",
            usage=usage,
        )
        assert message.role == "assistant"
        assert message.thinking == "Let me analyze this..."
        assert len(message.tool_uses) == 1
        assert message.tool_uses[0].name == "Read"
        assert message.model == "claude-3-opus"
        assert message.usage.input_tokens == 100

    def test_missing_required_fields_raises_error(self):
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            TranscriptMessageResponse(uuid="msg-1", role="user")

    def test_tool_uses_from_dicts(self):
        """Test that tool_uses can be created from dicts."""
        message = TranscriptMessageResponse(
            uuid="msg-1",
            role="assistant",
            content="Done",
            timestamp="2024-01-01T00:00:00Z",
            tool_uses=[{"id": "t1", "name": "Read", "input": {}}],
        )
        assert len(message.tool_uses) == 1
        assert isinstance(message.tool_uses[0], ToolUseResponse)

    def test_usage_from_dict(self):
        """Test that usage can be created from dict."""
        message = TranscriptMessageResponse(
            uuid="msg-1",
            role="assistant",
            content="Done",
            timestamp="2024-01-01T00:00:00Z",
            usage={"input_tokens": 100, "output_tokens": 50},
        )
        assert isinstance(message.usage, TokenUsageResponse)
        assert message.usage.input_tokens == 100


class TestSessionDetailResponse:
    """Tests for SessionDetailResponse schema."""

    def test_minimal_session_detail(self):
        """Test creating session detail with required fields only."""
        metadata = SessionMetadataResponse(session_id="test-uuid")
        detail = SessionDetailResponse(
            session_id="test-uuid",
            encoded_path="path",
            repo_path="/path",
            messages=[],
            metadata=metadata,
        )
        assert detail.session_id == "test-uuid"
        assert detail.encoded_path == "path"
        assert detail.repo_path == "/path"
        assert detail.repo_name is None
        assert detail.messages == []
        assert detail.summary is None
        assert detail.model is None
        assert detail.total_input_tokens == 0
        assert detail.total_output_tokens == 0
        assert detail.total_cache_read_tokens == 0
        assert detail.total_cache_creation_tokens == 0
        assert detail.start_time is None
        assert detail.end_time is None
        assert detail.claude_code_version is None
        assert detail.git_branch is None
        assert detail.is_active is False

    def test_full_session_detail(self):
        """Test creating session detail with all fields set."""
        messages = [
            TranscriptMessageResponse(
                uuid="msg-1",
                role="user",
                content="Hello",
                timestamp="2024-01-01T00:00:00Z",
            ),
            TranscriptMessageResponse(
                uuid="msg-2",
                role="assistant",
                content="Hi!",
                timestamp="2024-01-01T00:00:01Z",
            ),
        ]
        metadata = SessionMetadataResponse(
            session_id="test-uuid",
            title="Test",
            starred=True,
        )
        detail = SessionDetailResponse(
            session_id="test-uuid",
            encoded_path="path",
            repo_path="/path",
            repo_name="owner/repo",
            messages=messages,
            summary="A test conversation",
            model="claude-3-opus",
            total_input_tokens=1000,
            total_output_tokens=500,
            total_cache_read_tokens=200,
            total_cache_creation_tokens=100,
            start_time="2024-01-01T00:00:00Z",
            end_time="2024-01-01T00:01:00Z",
            claude_code_version="1.0.0",
            git_branch="main",
            metadata=metadata,
            is_active=True,
        )
        assert detail.repo_name == "owner/repo"
        assert len(detail.messages) == 2
        assert detail.summary == "A test conversation"
        assert detail.total_input_tokens == 1000
        assert detail.claude_code_version == "1.0.0"
        assert detail.is_active is True

    def test_missing_metadata_raises_error(self):
        """Test that missing metadata raises validation error."""
        with pytest.raises(ValidationError):
            SessionDetailResponse(
                session_id="test-uuid",
                encoded_path="path",
                repo_path="/path",
                messages=[],
            )

    def test_messages_from_dicts(self):
        """Test that messages can be created from dicts."""
        metadata = SessionMetadataResponse(session_id="test-uuid")
        detail = SessionDetailResponse(
            session_id="test-uuid",
            encoded_path="path",
            repo_path="/path",
            messages=[
                {
                    "uuid": "msg-1",
                    "role": "user",
                    "content": "Hello",
                    "timestamp": "2024-01-01T00:00:00Z",
                }
            ],
            metadata=metadata,
        )
        assert len(detail.messages) == 1
        assert isinstance(detail.messages[0], TranscriptMessageResponse)


class TestSubsessionDetailResponse:
    """Tests for SubsessionDetailResponse schema."""

    def test_minimal_subsession_detail(self):
        """Test creating subsession detail with required fields only."""
        detail = SubsessionDetailResponse(
            agent_id="abc1234",
            parent_session_id="parent-uuid",
            encoded_path="path",
            repo_path="/path",
            messages=[],
        )
        assert detail.agent_id == "abc1234"
        assert detail.parent_session_id == "parent-uuid"
        assert detail.encoded_path == "path"
        assert detail.repo_path == "/path"
        assert detail.messages == []
        assert detail.summary is None
        assert detail.model is None
        assert detail.total_input_tokens == 0
        assert detail.total_output_tokens == 0
        assert detail.total_cache_read_tokens == 0
        assert detail.total_cache_creation_tokens == 0
        assert detail.start_time is None
        assert detail.end_time is None

    def test_full_subsession_detail(self):
        """Test creating subsession detail with all fields set."""
        messages = [
            TranscriptMessageResponse(
                uuid="msg-1",
                role="user",
                content="Subtask",
                timestamp="2024-01-01T00:00:00Z",
            ),
        ]
        detail = SubsessionDetailResponse(
            agent_id="abc1234",
            parent_session_id="parent-uuid",
            encoded_path="path",
            repo_path="/path",
            messages=messages,
            summary="Subtask summary",
            model="claude-3-haiku",
            total_input_tokens=500,
            total_output_tokens=250,
            total_cache_read_tokens=100,
            total_cache_creation_tokens=50,
            start_time="2024-01-01T00:00:00Z",
            end_time="2024-01-01T00:00:30Z",
        )
        assert detail.agent_id == "abc1234"
        assert len(detail.messages) == 1
        assert detail.summary == "Subtask summary"
        assert detail.model == "claude-3-haiku"
        assert detail.total_input_tokens == 500

    def test_missing_required_fields_raises_error(self):
        """Test that missing required fields raise validation error."""
        with pytest.raises(ValidationError):
            SubsessionDetailResponse(agent_id="abc1234")


class TestSchemaModelDump:
    """Test model_dump functionality across schemas."""

    def test_entity_link_json_serializable(self):
        """Test that EntityLinkResponse is JSON serializable."""
        entity = EntityLinkResponse(kind="issue", number=42)
        data = entity.model_dump()
        import json
        json_str = json.dumps(data)
        assert '"kind": "issue"' in json_str
        assert '"number": 42' in json_str

    def test_nested_schema_serialization(self):
        """Test that nested schemas serialize correctly."""
        metadata = SessionMetadataResponse(
            session_id="test-uuid",
            entities=[EntityLinkResponse(kind="issue", number=1)],
        )
        data = metadata.model_dump()
        assert data["entities"][0] == {"kind": "issue", "number": 1}

    def test_optional_none_values_included(self):
        """Test that None values for optional fields are included by default."""
        metadata = SessionMetadataResponse(session_id="test-uuid")
        data = metadata.model_dump()
        assert "title" in data
        assert data["title"] is None

    def test_optional_none_values_excluded(self):
        """Test that None values can be excluded with exclude_none."""
        metadata = SessionMetadataResponse(session_id="test-uuid")
        data = metadata.model_dump(exclude_none=True)
        assert "title" not in data
        assert "session_id" in data


class TestSchemaModelValidateJson:
    """Test model_validate_json functionality across schemas."""

    def test_entity_from_json(self):
        """Test creating entity from JSON string."""
        json_str = '{"kind": "pr", "number": 99}'
        entity = EntityLinkResponse.model_validate_json(json_str)
        assert entity.kind == "pr"
        assert entity.number == 99

    def test_session_metadata_from_json(self):
        """Test creating session metadata from JSON string."""
        json_str = '{"session_id": "test-uuid", "starred": true, "tags": ["a", "b"]}'
        metadata = SessionMetadataResponse.model_validate_json(json_str)
        assert metadata.session_id == "test-uuid"
        assert metadata.starred is True
        assert metadata.tags == ["a", "b"]

    def test_invalid_json_raises_error(self):
        """Test that invalid JSON raises validation error."""
        with pytest.raises(ValidationError):
            EntityLinkResponse.model_validate_json('{"kind": "issue"}')  # missing number
