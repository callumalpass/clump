#!/usr/bin/env python3
"""
Migration script to convert from single central database to per-repo storage.

This script:
1. Reads the old central database (backend/claude_code_hub.db)
2. Creates ~/.clump/repos.json with repo registry
3. Creates per-repo databases at ~/.clump/projects/{hash}/data.db
4. Migrates sessions, tags, and other data to the appropriate repo DBs

Usage:
    python backend/scripts/migrate_to_per_repo.py

The old database is not deleted - you can remove it manually after verifying
the migration was successful.
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path for imports
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import create_engine, text, select
from sqlalchemy.orm import Session as SQLSession

from app.storage import (
    get_clump_dir,
    get_repos_json_path,
    save_repos,
    get_repo_db_path,
    RepoInfo,
)
from app.database import get_repo_db, init_repo_db


OLD_DB_PATH = backend_dir / "claude_code_hub.db"


def get_old_db_session():
    """Create a session for the old database."""
    if not OLD_DB_PATH.exists():
        print(f"Old database not found at {OLD_DB_PATH}")
        print("Nothing to migrate - you can start fresh with the new system.")
        return None

    engine = create_engine(f"sqlite:///{OLD_DB_PATH}")
    return SQLSession(engine)


def migrate_repos(old_session: SQLSession) -> dict[int, RepoInfo]:
    """Migrate repos from old DB to repos.json."""
    print("\n=== Migrating Repos ===")

    # Check if repos table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='repos'"
    ))
    if not result.fetchone():
        print("No repos table found in old database")
        return {}

    # Read repos from old DB
    result = old_session.execute(text("SELECT id, owner, name, local_path FROM repos"))
    old_repos = result.fetchall()

    if not old_repos:
        print("No repos found in old database")
        return {}

    print(f"Found {len(old_repos)} repos to migrate")

    # Convert to RepoInfo format
    repos: list[RepoInfo] = []
    repo_map: dict[int, RepoInfo] = {}  # old_id -> RepoInfo

    for row in old_repos:
        old_id, owner, name, local_path = row
        repo_info: RepoInfo = {
            "id": old_id,  # Keep same IDs for consistency
            "owner": owner,
            "name": name,
            "local_path": local_path,
        }
        repos.append(repo_info)
        repo_map[old_id] = repo_info
        print(f"  - {owner}/{name} (id={old_id}, path={local_path})")

    # Save to repos.json
    save_repos(repos)
    print(f"Saved {len(repos)} repos to {get_repos_json_path()}")

    return repo_map


async def migrate_sessions(old_session: SQLSession, repo_map: dict[int, RepoInfo]):
    """Migrate sessions to per-repo databases."""
    print("\n=== Migrating Sessions ===")

    # Check if sessions table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ))
    if not result.fetchone():
        print("No sessions table found in old database")
        return

    # Read sessions
    result = old_session.execute(text("""
        SELECT id, repo_id, kind, title, prompt, transcript, summary, status,
               process_id, claude_session_id, created_at, completed_at
        FROM sessions
    """))
    sessions = result.fetchall()

    if not sessions:
        print("No sessions found")
        return

    print(f"Found {len(sessions)} sessions to migrate")

    # Group by repo
    sessions_by_repo: dict[int, list] = {}
    for session in sessions:
        repo_id = session[1]
        if repo_id not in sessions_by_repo:
            sessions_by_repo[repo_id] = []
        sessions_by_repo[repo_id].append(session)

    # Migrate each repo's sessions
    for repo_id, repo_sessions in sessions_by_repo.items():
        if repo_id not in repo_map:
            print(f"  Warning: Repo {repo_id} not found in repo_map, skipping {len(repo_sessions)} sessions")
            continue

        repo = repo_map[repo_id]
        print(f"  Migrating {len(repo_sessions)} sessions for {repo['owner']}/{repo['name']}")

        # Initialize per-repo DB
        await init_repo_db(repo["local_path"])

        async with get_repo_db(repo["local_path"]) as db:
            for session in repo_sessions:
                (session_id, _, kind, title, prompt, transcript, summary, status,
                 process_id, claude_session_id, created_at, completed_at) = session

                # Insert session with same ID
                await db.execute(text("""
                    INSERT INTO sessions (id, repo_id, kind, title, prompt, transcript, summary, status,
                                          process_id, claude_session_id, created_at, completed_at)
                    VALUES (:id, :repo_id, :kind, :title, :prompt, :transcript, :summary, :status,
                            :process_id, :claude_session_id, :created_at, :completed_at)
                """), {
                    "id": session_id,
                    "repo_id": repo_id,
                    "kind": kind,
                    "title": title,
                    "prompt": prompt,
                    "transcript": transcript or "",
                    "summary": summary,
                    "status": status,
                    "process_id": process_id,
                    "claude_session_id": claude_session_id,
                    "created_at": created_at,
                    "completed_at": completed_at,
                })

            await db.commit()


async def migrate_session_entities(old_session: SQLSession, repo_map: dict[int, RepoInfo]):
    """Migrate session entities to per-repo databases."""
    print("\n=== Migrating Session Entities ===")

    # Check if table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='session_entities'"
    ))
    if not result.fetchone():
        print("No session_entities table found in old database")
        return

    # Read session entities
    result = old_session.execute(text("""
        SELECT id, session_id, repo_id, entity_kind, entity_number, created_at
        FROM session_entities
    """))
    entities = result.fetchall()

    if not entities:
        print("No session entities found")
        return

    print(f"Found {len(entities)} session entities to migrate")

    # Group by repo
    entities_by_repo: dict[int, list] = {}
    for entity in entities:
        repo_id = entity[2]
        if repo_id not in entities_by_repo:
            entities_by_repo[repo_id] = []
        entities_by_repo[repo_id].append(entity)

    # Migrate each repo's entities
    for repo_id, repo_entities in entities_by_repo.items():
        if repo_id not in repo_map:
            print(f"  Warning: Repo {repo_id} not found, skipping {len(repo_entities)} entities")
            continue

        repo = repo_map[repo_id]
        print(f"  Migrating {len(repo_entities)} entities for {repo['owner']}/{repo['name']}")

        async with get_repo_db(repo["local_path"]) as db:
            for entity in repo_entities:
                entity_id, session_id, _, entity_kind, entity_number, created_at = entity

                await db.execute(text("""
                    INSERT INTO session_entities (id, session_id, repo_id, entity_kind, entity_number, created_at)
                    VALUES (:id, :session_id, :repo_id, :entity_kind, :entity_number, :created_at)
                """), {
                    "id": entity_id,
                    "session_id": session_id,
                    "repo_id": repo_id,
                    "entity_kind": entity_kind,
                    "entity_number": entity_number,
                    "created_at": created_at,
                })

            await db.commit()


async def migrate_tags(old_session: SQLSession, repo_map: dict[int, RepoInfo]):
    """Migrate tags to per-repo databases."""
    print("\n=== Migrating Tags ===")

    # Check if table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tags'"
    ))
    if not result.fetchone():
        print("No tags table found in old database")
        return

    # Read tags
    result = old_session.execute(text("""
        SELECT id, repo_id, name, color, created_at
        FROM tags
    """))
    tags = result.fetchall()

    if not tags:
        print("No tags found")
        return

    print(f"Found {len(tags)} tags to migrate")

    # Group by repo
    tags_by_repo: dict[int, list] = {}
    for tag in tags:
        repo_id = tag[1]
        if repo_id not in tags_by_repo:
            tags_by_repo[repo_id] = []
        tags_by_repo[repo_id].append(tag)

    # Migrate each repo's tags
    for repo_id, repo_tags in tags_by_repo.items():
        if repo_id not in repo_map:
            print(f"  Warning: Repo {repo_id} not found, skipping {len(repo_tags)} tags")
            continue

        repo = repo_map[repo_id]
        print(f"  Migrating {len(repo_tags)} tags for {repo['owner']}/{repo['name']}")

        async with get_repo_db(repo["local_path"]) as db:
            for tag in repo_tags:
                tag_id, _, name, color, created_at = tag

                await db.execute(text("""
                    INSERT INTO tags (id, repo_id, name, color, created_at)
                    VALUES (:id, :repo_id, :name, :color, :created_at)
                """), {
                    "id": tag_id,
                    "repo_id": repo_id,
                    "name": name,
                    "color": color,
                    "created_at": created_at,
                })

            await db.commit()


async def migrate_issue_tags(old_session: SQLSession, repo_map: dict[int, RepoInfo]):
    """Migrate issue tags to per-repo databases."""
    print("\n=== Migrating Issue Tags ===")

    # Check if table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='issue_tags'"
    ))
    if not result.fetchone():
        print("No issue_tags table found in old database")
        return

    # Read issue tags
    result = old_session.execute(text("""
        SELECT id, tag_id, repo_id, issue_number, created_at
        FROM issue_tags
    """))
    issue_tags = result.fetchall()

    if not issue_tags:
        print("No issue tags found")
        return

    print(f"Found {len(issue_tags)} issue tags to migrate")

    # Group by repo
    tags_by_repo: dict[int, list] = {}
    for it in issue_tags:
        repo_id = it[2]
        if repo_id not in tags_by_repo:
            tags_by_repo[repo_id] = []
        tags_by_repo[repo_id].append(it)

    # Migrate each repo's issue tags
    for repo_id, repo_issue_tags in tags_by_repo.items():
        if repo_id not in repo_map:
            print(f"  Warning: Repo {repo_id} not found, skipping {len(repo_issue_tags)} issue tags")
            continue

        repo = repo_map[repo_id]
        print(f"  Migrating {len(repo_issue_tags)} issue tags for {repo['owner']}/{repo['name']}")

        async with get_repo_db(repo["local_path"]) as db:
            for it in repo_issue_tags:
                it_id, tag_id, _, issue_number, created_at = it

                await db.execute(text("""
                    INSERT INTO issue_tags (id, tag_id, repo_id, issue_number, created_at)
                    VALUES (:id, :tag_id, :repo_id, :issue_number, :created_at)
                """), {
                    "id": it_id,
                    "tag_id": tag_id,
                    "repo_id": repo_id,
                    "issue_number": issue_number,
                    "created_at": created_at,
                })

            await db.commit()


async def migrate_actions(old_session: SQLSession, repo_map: dict[int, RepoInfo]):
    """Migrate actions to per-repo databases."""
    print("\n=== Migrating Actions ===")

    # Check if table exists
    result = old_session.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='actions'"
    ))
    if not result.fetchone():
        print("No actions table found in old database")
        return

    # Read actions with session's repo_id
    result = old_session.execute(text("""
        SELECT a.id, a.session_id, a.type, a.payload, a.status, a.created_at, s.repo_id
        FROM actions a
        JOIN sessions s ON a.session_id = s.id
    """))
    actions = result.fetchall()

    if not actions:
        print("No actions found")
        return

    print(f"Found {len(actions)} actions to migrate")

    # Group by repo
    actions_by_repo: dict[int, list] = {}
    for action in actions:
        repo_id = action[6]
        if repo_id not in actions_by_repo:
            actions_by_repo[repo_id] = []
        actions_by_repo[repo_id].append(action)

    # Migrate each repo's actions
    for repo_id, repo_actions in actions_by_repo.items():
        if repo_id not in repo_map:
            print(f"  Warning: Repo {repo_id} not found, skipping {len(repo_actions)} actions")
            continue

        repo = repo_map[repo_id]
        print(f"  Migrating {len(repo_actions)} actions for {repo['owner']}/{repo['name']}")

        async with get_repo_db(repo["local_path"]) as db:
            for action in repo_actions:
                action_id, session_id, action_type, payload, status, created_at, _ = action

                await db.execute(text("""
                    INSERT INTO actions (id, session_id, type, payload, status, created_at)
                    VALUES (:id, :session_id, :type, :payload, :status, :created_at)
                """), {
                    "id": action_id,
                    "session_id": session_id,
                    "type": action_type,
                    "payload": payload,
                    "status": status,
                    "created_at": created_at,
                })

            await db.commit()


async def main():
    """Run the migration."""
    print("=" * 60)
    print("Per-Repo Storage Migration")
    print("=" * 60)
    print(f"\nOld database: {OLD_DB_PATH}")
    print(f"New storage: {get_clump_dir()}")

    # Ensure clump directory exists
    get_clump_dir()

    # Check for existing repos.json
    repos_json_path = get_repos_json_path()
    if repos_json_path.exists():
        print(f"\nWarning: {repos_json_path} already exists!")
        response = input("Continue and potentially overwrite? (y/N): ")
        if response.lower() != 'y':
            print("Migration cancelled.")
            return

    # Connect to old database
    old_session = get_old_db_session()
    if old_session is None:
        return

    try:
        # Migrate repos
        repo_map = migrate_repos(old_session)
        if not repo_map:
            print("\nNo repos to migrate. Migration complete.")
            return

        # Migrate data to per-repo databases
        await migrate_sessions(old_session, repo_map)
        await migrate_session_entities(old_session, repo_map)
        await migrate_tags(old_session, repo_map)
        await migrate_issue_tags(old_session, repo_map)
        await migrate_actions(old_session, repo_map)

        print("\n" + "=" * 60)
        print("Migration Complete!")
        print("=" * 60)
        print(f"\nRepos saved to: {repos_json_path}")
        print(f"Per-repo data in: {get_clump_dir() / 'projects'}")
        print(f"\nThe old database at {OLD_DB_PATH} has been preserved.")
        print("You can delete it once you've verified the migration was successful.")

    finally:
        old_session.close()


if __name__ == "__main__":
    asyncio.run(main())
