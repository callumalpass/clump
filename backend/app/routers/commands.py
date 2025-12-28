"""
Router for reading and managing custom slash commands from .claude/commands/

Commands are loaded from two locations:
1. Clump's built-in commands (this project's .claude/commands/)
2. Target repo's commands (repo's .claude/commands/) - these take precedence
"""

import logging
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Valid command categories - used for validation and iteration
COMMAND_CATEGORIES = frozenset({"issue", "pr", "general"})

router = APIRouter()


class CommandMetadata(BaseModel):
    """Parsed command metadata from frontmatter"""
    id: str  # filename without extension
    name: str
    shortName: str
    description: str
    category: str  # 'issue' or 'pr'
    template: str  # The prompt template with {{placeholders}}
    source: str = "builtin"  # 'builtin' or 'repo'


class CommandsResponse(BaseModel):
    """Response containing all available commands"""
    issue: list[CommandMetadata]
    pr: list[CommandMetadata]
    general: list[CommandMetadata]


class CommandCreate(BaseModel):
    """Request body for creating/updating a command"""
    name: str
    shortName: str
    description: str
    template: str


def get_user_commands_dir() -> Path:
    """Get user's global ~/.claude/commands directory (Claude Code user commands)"""
    return Path.home() / ".claude" / "commands"


def get_builtin_commands_dir() -> Path:
    """Get clump's built-in .claude/commands directory"""
    # Navigate from backend/app/routers to project root
    project_root = Path(__file__).parent.parent.parent.parent
    return project_root / ".claude" / "commands"


def get_repo_commands_dir(repo_path: str) -> Path:
    """Get a repo's .claude/commands directory"""
    return Path(repo_path) / ".claude" / "commands"


def find_command_file(
    command_id: str, category: str, repo_path: Optional[str] = None
) -> tuple[Optional[Path], str]:
    """
    Find a command file by searching the 3-tier hierarchy.

    Search order (highest to lowest priority):
    1. Repo-specific commands (if repo_path provided)
    2. User's global commands (~/.claude/commands/)
    3. Built-in commands

    Args:
        command_id: The command filename without extension
        category: The command category (issue, pr, general)
        repo_path: Optional path to a repo for repo-specific commands

    Returns:
        A tuple of (file_path, source) where source is one of:
        "repo", "user", or "builtin". Returns (None, "") if not found.
    """
    filename = f"{command_id}.md"

    # Try repo-specific first (highest priority)
    if repo_path:
        repo_file = get_repo_commands_dir(repo_path) / category / filename
        if repo_file.exists():
            return repo_file, "repo"

    # Try user's global commands (~/.claude/commands/)
    user_file = get_user_commands_dir() / category / filename
    if user_file.exists():
        return user_file, "user"

    # Fall back to built-in
    builtin_file = get_builtin_commands_dir() / category / filename
    if builtin_file.exists():
        return builtin_file, "builtin"

    return None, ""


def parse_command_file(file_path: Path, category: str, source: str = "builtin") -> Optional[CommandMetadata]:
    """Parse a command markdown file with YAML frontmatter"""
    try:
        content = file_path.read_text()

        # Check for YAML frontmatter
        if not content.startswith("---"):
            return None

        # Split frontmatter and body
        parts = content.split("---", 2)
        if len(parts) < 3:
            return None

        frontmatter = parts[1].strip()
        template = parts[2].strip()

        # Parse YAML frontmatter
        metadata = yaml.safe_load(frontmatter)
        if not metadata:
            return None

        # Extract required fields
        name = metadata.get("name")
        short_name = metadata.get("shortName")
        description = metadata.get("description")

        if not all([name, short_name, description]):
            return None

        return CommandMetadata(
            id=file_path.stem,
            name=name,
            shortName=short_name,
            description=description,
            category=category,
            template=template,
            source=source,
        )
    except yaml.YAMLError as e:
        logger.warning("Failed to parse YAML frontmatter in %s: %s", file_path, e)
        return None
    except OSError as e:
        logger.warning("Failed to read command file %s: %s", file_path, e)
        return None


def load_commands_from_dir(commands_dir: Path, category: str, source: str = "builtin") -> list[CommandMetadata]:
    """Load all commands from a category directory"""
    category_dir = commands_dir / category
    if not category_dir.exists():
        return []

    commands = []
    for file_path in sorted(category_dir.glob("*.md")):
        command = parse_command_file(file_path, category, source)
        if command:
            commands.append(command)

    return commands


def merge_commands(builtin: list[CommandMetadata], repo: list[CommandMetadata]) -> list[CommandMetadata]:
    """Merge commands, with repo commands taking precedence over builtin"""
    # Create dict keyed by id, builtin first so repo overwrites
    commands_by_id = {cmd.id: cmd for cmd in builtin}
    for cmd in repo:
        commands_by_id[cmd.id] = cmd
    return list(commands_by_id.values())


def serialize_command_to_md(command: CommandCreate) -> str:
    """Serialize a command to markdown format with YAML frontmatter"""
    frontmatter = yaml.dump({
        "name": command.name,
        "shortName": command.shortName,
        "description": command.description,
    }, default_flow_style=False, allow_unicode=True).strip()

    return f"---\n{frontmatter}\n---\n\n{command.template}\n"


@router.get("/commands", response_model=CommandsResponse)
async def get_commands(
    repo_path: Optional[str] = Query(None, description="Path to target repo for repo-specific commands")
) -> CommandsResponse:
    """
    Get all available slash commands.

    Loads from (in priority order, later sources override earlier):
    1. Clump's built-in commands (.claude/commands/)
    2. User's global commands (~/.claude/commands/)
    3. Target repo's commands (if repo_path provided) - highest precedence
    """
    builtin_dir = get_builtin_commands_dir()
    user_dir = get_user_commands_dir()

    # Load built-in commands (lowest priority)
    builtin_issue = load_commands_from_dir(builtin_dir, "issue", "builtin")
    builtin_pr = load_commands_from_dir(builtin_dir, "pr", "builtin")
    builtin_general = load_commands_from_dir(builtin_dir, "general", "builtin")

    # Load user's global commands from ~/.claude/commands/
    user_issue = load_commands_from_dir(user_dir, "issue", "user")
    user_pr = load_commands_from_dir(user_dir, "pr", "user")
    user_general = load_commands_from_dir(user_dir, "general", "user")

    # Merge builtin with user (user overrides builtin)
    issue_commands = merge_commands(builtin_issue, user_issue)
    pr_commands = merge_commands(builtin_pr, user_pr)
    general_commands = merge_commands(builtin_general, user_general)

    # Load repo-specific commands if path provided (highest priority)
    if repo_path:
        repo_dir = get_repo_commands_dir(repo_path)
        repo_issue = load_commands_from_dir(repo_dir, "issue", "repo")
        repo_pr = load_commands_from_dir(repo_dir, "pr", "repo")
        repo_general = load_commands_from_dir(repo_dir, "general", "repo")

        # Merge with repo taking precedence
        issue_commands = merge_commands(issue_commands, repo_issue)
        pr_commands = merge_commands(pr_commands, repo_pr)
        general_commands = merge_commands(general_commands, repo_general)

    return CommandsResponse(
        issue=issue_commands,
        pr=pr_commands,
        general=general_commands,
    )


@router.get("/commands/{category}/{command_id}", response_model=CommandMetadata)
async def get_command(
    category: str,
    command_id: str,
    repo_path: Optional[str] = Query(None, description="Path to target repo")
) -> CommandMetadata:
    """Get a specific command by category and ID"""
    if category not in COMMAND_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(sorted(COMMAND_CATEGORIES))}")

    file_path, source = find_command_file(command_id, category, repo_path)

    if not file_path:
        raise HTTPException(status_code=404, detail=f"Command '{command_id}' not found")

    command = parse_command_file(file_path, category, source)
    if not command:
        raise HTTPException(status_code=500, detail="Failed to parse command file")

    return command


@router.post("/commands/{category}", response_model=CommandMetadata)
async def create_command(
    category: str,
    command: CommandCreate,
    repo_path: Optional[str] = Query(None, description="Path to save command (defaults to clump)")
) -> CommandMetadata:
    """Create a new command"""
    if category not in COMMAND_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(sorted(COMMAND_CATEGORIES))}")

    # Determine where to save
    if repo_path:
        commands_dir = get_repo_commands_dir(repo_path)
        source = "repo"
    else:
        commands_dir = get_builtin_commands_dir()
        source = "builtin"

    # Create directory if needed
    category_dir = commands_dir / category
    category_dir.mkdir(parents=True, exist_ok=True)

    # Generate ID from name (slugify)
    command_id = command.name.lower().replace(" ", "-")
    command_id = "".join(c for c in command_id if c.isalnum() or c == "-")

    file_path = category_dir / f"{command_id}.md"

    # Check if already exists
    if file_path.exists():
        raise HTTPException(status_code=409, detail=f"Command '{command_id}' already exists")

    # Write the file
    content = serialize_command_to_md(command)
    file_path.write_text(content)

    return CommandMetadata(
        id=command_id,
        name=command.name,
        shortName=command.shortName,
        description=command.description,
        category=category,
        template=command.template,
        source=source,
    )


@router.put("/commands/{category}/{command_id}", response_model=CommandMetadata)
async def update_command(
    category: str,
    command_id: str,
    command: CommandCreate,
    repo_path: Optional[str] = Query(None, description="Path to repo containing the command")
) -> CommandMetadata:
    """Update an existing command"""
    if category not in COMMAND_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(sorted(COMMAND_CATEGORIES))}")

    file_path, source = find_command_file(command_id, category, repo_path)

    if not file_path:
        raise HTTPException(status_code=404, detail=f"Command '{command_id}' not found")

    # Write the updated content
    content = serialize_command_to_md(command)
    file_path.write_text(content)

    return CommandMetadata(
        id=command_id,
        name=command.name,
        shortName=command.shortName,
        description=command.description,
        category=category,
        template=command.template,
        source=source,
    )


@router.delete("/commands/{category}/{command_id}")
async def delete_command(
    category: str,
    command_id: str,
    repo_path: Optional[str] = Query(None, description="Path to repo containing the command")
) -> dict:
    """Delete a command"""
    if category not in COMMAND_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Category must be one of: {', '.join(sorted(COMMAND_CATEGORIES))}")

    file_path, _ = find_command_file(command_id, category, repo_path)

    if not file_path:
        raise HTTPException(status_code=404, detail=f"Command '{command_id}' not found")

    # Delete the file
    file_path.unlink()

    return {"status": "deleted", "id": command_id}
