"""
Router for reading custom slash commands from .claude/commands/
"""

import re
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter()


class CommandMetadata(BaseModel):
    """Parsed command metadata from frontmatter"""
    id: str  # filename without extension
    name: str
    shortName: str
    description: str
    category: str  # 'issue' or 'pr'
    template: str  # The prompt template with {{placeholders}}


class CommandsResponse(BaseModel):
    """Response containing all available commands"""
    issue: list[CommandMetadata]
    pr: list[CommandMetadata]


def get_commands_dir() -> Path:
    """Get the .claude/commands directory relative to the project root"""
    # Navigate from backend/app/routers to project root
    project_root = Path(__file__).parent.parent.parent.parent
    return project_root / ".claude" / "commands"


def parse_command_file(file_path: Path, category: str) -> Optional[CommandMetadata]:
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
        )
    except Exception as e:
        print(f"Error parsing command file {file_path}: {e}")
        return None


def load_commands_from_dir(commands_dir: Path, category: str) -> list[CommandMetadata]:
    """Load all commands from a category directory"""
    category_dir = commands_dir / category
    if not category_dir.exists():
        return []

    commands = []
    for file_path in sorted(category_dir.glob("*.md")):
        command = parse_command_file(file_path, category)
        if command:
            commands.append(command)

    return commands


@router.get("/commands", response_model=CommandsResponse)
async def get_commands() -> CommandsResponse:
    """
    Get all available slash commands.

    Reads from .claude/commands/issue/ and .claude/commands/pr/
    """
    commands_dir = get_commands_dir()

    return CommandsResponse(
        issue=load_commands_from_dir(commands_dir, "issue"),
        pr=load_commands_from_dir(commands_dir, "pr"),
    )


@router.get("/commands/{category}/{command_id}", response_model=CommandMetadata)
async def get_command(category: str, command_id: str) -> CommandMetadata:
    """Get a specific command by category and ID"""
    if category not in ("issue", "pr"):
        raise HTTPException(status_code=400, detail="Category must be 'issue' or 'pr'")

    commands_dir = get_commands_dir()
    file_path = commands_dir / category / f"{command_id}.md"

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"Command '{command_id}' not found")

    command = parse_command_file(file_path, category)
    if not command:
        raise HTTPException(status_code=500, detail="Failed to parse command file")

    return command
