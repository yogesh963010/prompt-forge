"""Tests for Branch 16: Version History (pf-16/feature-backend/version-history).

Covers:
1. Create first version
2. Create second version
3. Sequential version numbering
4. List versions
5. Get version
6. Version snapshot contains Prompt System configuration
7. Change note is saved
8. Created user is stored
9. Unauthorized Prompt System access
10. Unauthorized version access
11. Compare two versions
12. Detect changed instructions
13. Detect changed variables
14. Detect changed modules
15. Restore old version
16. Restore creates a new version
17. Existing versions remain after restore
18. Restored configuration matches the selected snapshot
19. Version numbers continue sequentially after restore
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
from backend.app.models.module_reference import ModuleReference
from backend.app.models.prompt_module import PromptModule
from backend.app.models.prompt_system import PromptSystem
from backend.app.models.prompt_version import PromptVersion
from backend.app.models.user import User
from backend.app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_session():
    """Isolated async SQLite in-memory DB with all tables created fresh per test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestingSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with TestingSessionLocal() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
def client(db_session):
    """TestClient with overridden get_db dependency."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def user1(db_session):
    """Create and persist User 1."""
    u = User(
        name="User One",
        email="user1@promptforge.io",
        password_hash="$2b$12$hashedpassword_user1",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user2(db_session):
    """Create and persist User 2."""
    u = User(
        name="User Two",
        email="user2@promptforge.io",
        password_hash="$2b$12$hashedpassword_user2",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers1(user1):
    token = create_access_token(data={"sub": str(user1.id), "email": user1.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers2(user2):
    token = create_access_token(data={"sub": str(user2.id), "email": user2.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def prompt_system1(db_session, user1):
    """PromptSystem owned by user1."""
    ps = PromptSystem(
        name="Technical Writer",
        description="Generates technical articles",
        owner_id=user1.id,
        instructions="Write an article about {topic} for {audience}.",
        variables=[
            {"name": "topic", "type": "text", "required": True},
            {"name": "audience", "type": "text", "required": True},
        ],
        examples=[{"title": "Ex1", "input": "Topic", "expected": "Output"}],
        output_format="Return markdown text.",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def module1(db_session, user1):
    """PromptModule owned by user1."""
    pm = PromptModule(
        name="Research Module",
        description="Provides deep web research",
        instructions="Conduct in-depth research",
        owner_id=user1.id,
    )
    db_session.add(pm)
    await db_session.commit()
    await db_session.refresh(pm)
    return pm


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_1_create_first_version(client, auth_headers1, prompt_system1):
    """1. Create first version snapshot of a PromptSystem."""
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Initial version snapshot"},
        headers=auth_headers1,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["version_number"] == 1
    assert data["prompt_system_id"] == prompt_system1.id
    assert data["change_note"] == "Initial version snapshot"
    assert "configuration_snapshot" in data


def test_2_create_second_version(client, auth_headers1, prompt_system1):
    """2. Create second version snapshot."""
    client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Version 1"},
        headers=auth_headers1,
    )

    # Make a change to the PromptSystem
    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"instructions": "Updated instruction text."},
        headers=auth_headers1,
    )

    res2 = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Version 2 after instruction change"},
        headers=auth_headers1,
    )
    assert res2.status_code == 201
    assert res2.json()["version_number"] == 2


def test_3_sequential_version_numbering(client, auth_headers1, prompt_system1):
    """3. Sequential version numbering increments 1, 2, 3."""
    v1 = client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1).json()
    v2 = client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1).json()
    v3 = client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1).json()

    assert v1["version_number"] == 1
    assert v2["version_number"] == 2
    assert v3["version_number"] == 3


def test_4_list_versions(client, auth_headers1, prompt_system1):
    """4. List versions returns list sorted newest first."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    res = client.get(f"/prompt-systems/{prompt_system1.id}/versions", headers=auth_headers1)
    assert res.status_code == 200
    versions = res.json()
    assert len(versions) == 2
    assert versions[0]["version_number"] == 2
    assert versions[1]["version_number"] == 1


def test_5_get_version(client, auth_headers1, prompt_system1):
    """5. Retrieve a single version snapshot."""
    created = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Get target"},
        headers=auth_headers1,
    ).json()

    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/{created['id']}",
        headers=auth_headers1,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == created["id"]
    assert data["change_note"] == "Get target"


def test_6_version_snapshot_contains_prompt_system_configuration(client, auth_headers1, prompt_system1):
    """6. Version snapshot contains all core configuration fields."""
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Full snapshot test"},
        headers=auth_headers1,
    )
    snap = res.json()["configuration_snapshot"]
    assert snap["name"] == "Technical Writer"
    assert snap["description"] == "Generates technical articles"
    assert "topic" in str(snap["variables"])
    assert "audience" in str(snap["variables"])
    assert snap["instructions"] == "Write an article about {topic} for {audience}."
    assert snap["output_format"] == "Return markdown text."


def test_7_change_note_is_saved(client, auth_headers1, prompt_system1):
    """7. Change note is saved and retrieved accurately."""
    note = "Added research module and refined prompt tone."
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": note},
        headers=auth_headers1,
    )
    data = res.json()
    assert data["change_note"] == note


def test_8_created_user_is_stored(client, auth_headers1, prompt_system1, user1):
    """8. Created by user ID is accurately stored on version."""
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "User check"},
        headers=auth_headers1,
    )
    assert res.json()["created_by"] == user1.id


def test_9_unauthorized_prompt_system_access(client, auth_headers2, prompt_system1):
    """9. User 2 cannot create or list versions on User 1's PromptSystem -> 403."""
    res_create = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Unauthorized creation"},
        headers=auth_headers2,
    )
    assert res_create.status_code == 403

    res_list = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions",
        headers=auth_headers2,
    )
    assert res_list.status_code == 403


def test_10_unauthorized_version_access(client, auth_headers1, auth_headers2, prompt_system1):
    """10. User 2 cannot view or restore User 1's version -> 403."""
    v = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "User 1 version"},
        headers=auth_headers1,
    ).json()

    res_get = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/{v['id']}",
        headers=auth_headers2,
    )
    assert res_get.status_code == 403

    res_restore = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions/{v['id']}/restore",
        headers=auth_headers2,
    )
    assert res_restore.status_code == 403


def test_11_compare_two_versions(client, auth_headers1, prompt_system1):
    """11. Compare two versions returns structured comparison."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)

    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"description": "New description"},
        headers=auth_headers1,
    )
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/compare?version_a=1&version_b=2",
        headers=auth_headers1,
    )
    assert res.status_code == 200
    comp = res.json()
    assert comp["version_a"] == 1
    assert comp["version_b"] == 2
    assert "changes" in comp
    assert comp["changes"]["description"]["changed"] is True
    assert comp["changes"]["description"]["before"] == "Generates technical articles"
    assert comp["changes"]["description"]["after"] == "New description"


def test_12_detect_changed_instructions(client, auth_headers1, prompt_system1):
    """12. Comparison detects instruction changes."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"instructions": "Completely new instructions for LLM."},
        headers=auth_headers1,
    )
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/compare?version_a=1&version_b=2",
        headers=auth_headers1,
    )
    assert res.status_code == 200
    changes = res.json()["changes"]
    assert changes["instructions"]["changed"] is True
    assert "Completely new instructions" in changes["instructions"]["after"]


def test_13_detect_changed_variables(client, auth_headers1, prompt_system1):
    """13. Comparison detects variable changes."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"variables": [{"name": "topic"}, {"name": "audience"}, {"name": "tone"}]},
        headers=auth_headers1,
    )
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/compare?version_a=1&version_b=2",
        headers=auth_headers1,
    )
    assert res.status_code == 200
    changes = res.json()["changes"]
    assert changes["variables"]["changed"] is True


def test_14_detect_changed_modules(client, auth_headers1, prompt_system1, module1):
    """14. Comparison detects module changes."""
    # V1 has no attached modules
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    # Attach module to prompt system
    attach_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/modules",
        json={"module_id": module1.id, "enabled": True},
        headers=auth_headers1,
    )
    assert attach_res.status_code == 201

    # V2 has module attached
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={}, headers=auth_headers1)

    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/versions/compare?version_a=1&version_b=2",
        headers=auth_headers1,
    )
    assert res.status_code == 200
    changes = res.json()["changes"]
    assert changes["modules"]["changed"] is True
    assert len(changes["modules"]["before"]) == 0
    assert len(changes["modules"]["after"]) == 1


def test_15_restore_old_version(client, auth_headers1, prompt_system1):
    """15. Restore previous version resets current prompt system configuration."""
    # V1: Original instructions
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)

    # Modify instructions
    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"instructions": "Modified instructions that we will revert."},
        headers=auth_headers1,
    )
    # V2
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    # Restore V1
    restore_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions/1/restore",
        headers=auth_headers1,
    )
    assert restore_res.status_code == 200

    # Current prompt system instructions should match V1
    curr = client.get(f"/prompt-systems/{prompt_system1.id}", headers=auth_headers1).json()
    assert curr["instructions"] == "Write an article about {topic} for {audience}."


def test_16_restore_creates_a_new_version(client, auth_headers1, prompt_system1):
    """16. Restoring creates a new sequential version (Version 3)."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    restore_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions/1/restore",
        headers=auth_headers1,
    )
    assert restore_res.status_code == 200
    data = restore_res.json()
    assert data["new_version_number"] == 3
    assert data["restored_from_version"] == 1


def test_17_existing_versions_remain_after_restore(client, auth_headers1, prompt_system1):
    """17. History is append-only: all previous versions remain intact after restore."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    client.post(f"/prompt-systems/{prompt_system1.id}/versions/1/restore", headers=auth_headers1)

    versions_res = client.get(f"/prompt-systems/{prompt_system1.id}/versions", headers=auth_headers1)
    assert versions_res.status_code == 200
    v_numbers = [v["version_number"] for v in versions_res.json()]
    assert v_numbers == [3, 2, 1]


def test_18_restored_configuration_matches_selected_snapshot(client, auth_headers1, prompt_system1):
    """18. The restored Prompt System configuration exactly matches the selected version snapshot."""
    # V1
    v1_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "V1 to test snapshot match"},
        headers=auth_headers1,
    ).json()

    # Heavy modifications in V2
    client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={
            "name": "Different Name",
            "description": "Completely new description",
            "instructions": "Different instructions",
            "output_format": "JSON object",
        },
        headers=auth_headers1,
    )
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    # Restore V1
    client.post(f"/prompt-systems/{prompt_system1.id}/versions/1/restore", headers=auth_headers1)

    # Fetch current Prompt System
    curr = client.get(f"/prompt-systems/{prompt_system1.id}", headers=auth_headers1).json()
    v1_snap = v1_res["configuration_snapshot"]
    assert curr["name"] == v1_snap["name"]
    assert curr["description"] == v1_snap["description"]
    assert curr["instructions"] == v1_snap["instructions"]
    assert curr["output_format"] == v1_snap["output_format"]


def test_19_version_numbers_continue_sequentially_after_restore(client, auth_headers1, prompt_system1):
    """19. Version numbers continue monotonically after restore (V1 -> V2 -> Restore V1 (V3) -> Next (V4))."""
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V1"}, headers=auth_headers1)
    client.post(f"/prompt-systems/{prompt_system1.id}/versions", json={"change_note": "V2"}, headers=auth_headers1)

    # Restore V1 creates V3
    restore_res = client.post(f"/prompt-systems/{prompt_system1.id}/versions/1/restore", headers=auth_headers1)
    assert restore_res.json()["new_version_number"] == 3

    # Next created version should be V4
    v4_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/versions",
        json={"change_note": "Post-restore V4"},
        headers=auth_headers1,
    )
    assert v4_res.status_code == 201
    assert v4_res.json()["version_number"] == 4
