"""Tests for Branch 21: Prompt Run History (pf-21/feature-prompt-history).

Covers all 14 required test cases:
1. Successful run creates history record.
2. Stored final_prompt exactly matches the final prompt returned by Composer/Run.
3. Runtime variables are stored.
4. Prompt System name snapshot is stored.
5. Module name snapshot is stored.
6. History list returns only current user's history.
7. User cannot access another user's history.
8. User cannot delete another user's history.
9. History detail returns stored final_prompt.
10. Deleting history does not delete Prompt System.
11. Failed prompt run does not create history.
12. Empty history works.
13. Multiple runs create multiple history records.
14. Old history remains unchanged after Prompt System is edited.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
from backend.app.models.prompt_system import PromptSystem
from backend.app.models.prompt_module import PromptModule
from backend.app.models.module_reference import ModuleReference
from backend.app.models.prompt_run_history import PromptRunHistory
from backend.app.models.user import User
from backend.app.services.auth_service import create_access_token


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
    """TestClient wired to the test DB session."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def user1(db_session):
    u = User(
        name="User One",
        email="user1@example.com",
        password_hash="$2b$12$hashedpasswordforuserone",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user2(db_session):
    u = User(
        name="User Two",
        email="user2@example.com",
        password_hash="$2b$12$hashedpasswordforusertwo",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


def auth_header(user: User) -> dict:
    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def sample_system(db_session, user1):
    system = PromptSystem(
        name="BDE LinkedIn Client Outreach Assistant",
        description="Assists with client outreach on LinkedIn",
        owner_id=user1.id,
        instructions="Compose an outreach message for {{prospect_name}} at {{company_name}}.",
        variables=[
            {"name": "prospect_name", "type": "text", "required": True},
            {"name": "company_name", "type": "text", "required": True},
        ],
    )
    db_session.add(system)
    await db_session.commit()
    await db_session.refresh(system)
    return system


@pytest.fixture
async def sample_system_with_module(db_session, user1, sample_system):
    module = PromptModule(
        name="Initial Client Outreach",
        description="Initial outreach message template",
        owner_id=user1.id,
        instructions="Hello {{prospect_name}}, I noticed your work at {{company_name}} as {{job_title}}.",
        variables=[
            {"name": "job_title", "type": "text", "required": True},
        ],
        input_context=["parent_variables"],
    )
    db_session.add(module)
    await db_session.commit()
    await db_session.refresh(module)

    ref = ModuleReference(
        prompt_system_id=sample_system.id,
        module_id=module.id,
        enabled=True,
        input_mapping={"parent_variables": "parent_variables"},
    )
    db_session.add(ref)
    await db_session.commit()
    await db_session.refresh(ref)
    return sample_system, module


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_successful_run_creates_history_record(client, user1, sample_system, db_session):
    """1. Successful run creates history record."""
    payload = {
        "variables": {
            "prospect_name": "Rahul",
            "company_name": "ABC Technologies",
        }
    }
    response = client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json=payload,
        headers=auth_header(user1),
    )
    assert response.status_code == 200
    data = response.json()
    assert "resolved_prompt" in data

    # Verify history record exists in DB
    result = await db_session.execute(
        select(PromptRunHistory).where(PromptRunHistory.prompt_system_id == sample_system.id)
    )
    histories = list(result.scalars().all())
    assert len(histories) == 1
    assert histories[0].user_id == user1.id
    assert histories[0].final_prompt == data["resolved_prompt"]


@pytest.mark.asyncio
async def test_stored_final_prompt_matches_returned_prompt(client, user1, sample_system):
    """2. Stored final_prompt exactly matches the final prompt returned by Composer/Run."""
    payload = {
        "variables": {
            "prospect_name": "Alice",
            "company_name": "Wonderland Corp",
        }
    }
    res_run = client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json=payload,
        headers=auth_header(user1),
    )
    assert res_run.status_code == 200
    returned_final_prompt = res_run.json()["resolved_prompt"]

    # Fetch history via API
    res_hist = client.get("/history", headers=auth_header(user1))
    assert res_hist.status_code == 200
    items = res_hist.json()["items"]
    assert len(items) == 1
    assert items[0]["final_prompt"] == returned_final_prompt
    assert "Alice" in items[0]["final_prompt"]
    assert "Wonderland Corp" in items[0]["final_prompt"]


@pytest.mark.asyncio
async def test_runtime_variables_stored(client, user1, sample_system):
    """3. Runtime variables are stored in the history record."""
    payload = {
        "variables": {
            "prospect_name": "Rahul",
            "company_name": "ABC Technologies",
        }
    }
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json=payload,
        headers=auth_header(user1),
    )

    res_hist = client.get("/history", headers=auth_header(user1))
    items = res_hist.json()["items"]
    assert len(items) == 1
    assert items[0]["runtime_variables"]["prospect_name"] == "Rahul"
    assert items[0]["runtime_variables"]["company_name"] == "ABC Technologies"


@pytest.mark.asyncio
async def test_prompt_system_name_snapshot_stored(client, user1, sample_system):
    """4. Prompt System name snapshot is stored."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Bob", "company_name": "Acme"}},
        headers=auth_header(user1),
    )

    res = client.get("/history", headers=auth_header(user1))
    item = res.json()["items"][0]
    assert item["prompt_system_name"] == "BDE LinkedIn Client Outreach Assistant"


@pytest.mark.asyncio
async def test_module_name_snapshot_stored(client, user1, sample_system_with_module):
    """5. Module name snapshot is stored when running a specific module."""
    system, module = sample_system_with_module
    payload = {
        "module_id": module.id,
        "variables": {
            "prospect_name": "Rahul",
            "company_name": "ABC Technologies",
        },
        "module_variables": {
            "job_title": "CTO",
        },
    }
    res_run = client.post(
        f"/prompt-systems/{system.id}/run",
        json=payload,
        headers=auth_header(user1),
    )
    assert res_run.status_code == 200

    res_hist = client.get("/history", headers=auth_header(user1))
    item = res_hist.json()["items"][0]
    assert item["module_name"] == "Initial Client Outreach"
    assert item["module_id"] == module.id
    assert "CTO" in item["final_prompt"]


@pytest.mark.asyncio
async def test_history_list_returns_only_current_user_history(client, user1, user2, sample_system, db_session):
    """6. History list returns only current user's history."""
    # User 1 runs prompt
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "User1_P", "company_name": "User1_C"}},
        headers=auth_header(user1),
    )

    # User 2 creates and runs their own prompt system
    system2 = PromptSystem(
        name="User2 System",
        owner_id=user2.id,
        instructions="Hello {{name}}",
        variables=[{"name": "name", "type": "text"}],
    )
    db_session.add(system2)
    await db_session.commit()
    await db_session.refresh(system2)

    client.post(
        f"/prompt-systems/{system2.id}/run",
        json={"variables": {"name": "Target"}},
        headers=auth_header(user2),
    )

    # User 1 history should only contain user 1 items
    res1 = client.get("/history", headers=auth_header(user1))
    items1 = res1.json()["items"]
    assert len(items1) == 1
    assert items1[0]["prompt_system_name"] == "BDE LinkedIn Client Outreach Assistant"

    # User 2 history should only contain user 2 items
    res2 = client.get("/history", headers=auth_header(user2))
    items2 = res2.json()["items"]
    assert len(items2) == 1
    assert items2[0]["prompt_system_name"] == "User2 System"


@pytest.mark.asyncio
async def test_user_cannot_access_another_user_history(client, user1, user2, sample_system):
    """7. User cannot access another user's history."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Secret", "company_name": "Inc"}},
        headers=auth_header(user1),
    )
    history_id = client.get("/history", headers=auth_header(user1)).json()["items"][0]["id"]

    # User 2 attempts to fetch user 1's history item
    res = client.get(f"/history/{history_id}", headers=auth_header(user2))
    assert res.status_code in (403, 404)


@pytest.mark.asyncio
async def test_user_cannot_delete_another_user_history(client, user1, user2, sample_system):
    """8. User cannot delete another user's history."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Secret", "company_name": "Inc"}},
        headers=auth_header(user1),
    )
    history_id = client.get("/history", headers=auth_header(user1)).json()["items"][0]["id"]

    # User 2 attempts to delete user 1's history item
    res = client.delete(f"/history/{history_id}", headers=auth_header(user2))
    assert res.status_code in (403, 404)

    # Verify history still exists
    res_check = client.get(f"/history/{history_id}", headers=auth_header(user1))
    assert res_check.status_code == 200


@pytest.mark.asyncio
async def test_history_detail_returns_stored_final_prompt(client, user1, sample_system):
    """9. History detail returns stored final_prompt."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "DetailTest", "company_name": "Corp"}},
        headers=auth_header(user1),
    )
    history_id = client.get("/history", headers=auth_header(user1)).json()["items"][0]["id"]

    res = client.get(f"/history/{history_id}", headers=auth_header(user1))
    assert res.status_code == 200
    item = res.json()
    assert item["id"] == history_id
    assert "DetailTest" in item["final_prompt"]
    assert "Corp" in item["final_prompt"]


@pytest.mark.asyncio
async def test_deleting_history_does_not_delete_prompt_system(client, user1, sample_system, db_session):
    """10. Deleting history does not delete Prompt System."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "DeleteTest", "company_name": "Corp"}},
        headers=auth_header(user1),
    )
    history_id = client.get("/history", headers=auth_header(user1)).json()["items"][0]["id"]

    # Delete history item
    res_del = client.delete(f"/history/{history_id}", headers=auth_header(user1))
    assert res_del.status_code == 200

    # Verify history item is gone
    res_check = client.get(f"/history/{history_id}", headers=auth_header(user1))
    assert res_check.status_code == 404

    # Verify Prompt System still exists in DB
    result = await db_session.execute(
        select(PromptSystem).where(PromptSystem.id == sample_system.id)
    )
    sys = result.scalar_one_or_none()
    assert sys is not None
    assert sys.id == sample_system.id


@pytest.mark.asyncio
async def test_failed_prompt_run_does_not_create_history(client, user1, sample_system, db_session):
    """11. Failed prompt run (e.g. missing required variable) does not create history."""
    # Omit company_name which is required
    res_fail = client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "OnlyName"}},
        headers=auth_header(user1),
    )
    assert res_fail.status_code in (400, 422)

    # Check history remains empty
    result = await db_session.execute(select(PromptRunHistory))
    histories = list(result.scalars().all())
    assert len(histories) == 0


@pytest.mark.asyncio
async def test_empty_history_returns_empty_list(client, user1):
    """12. Empty history works and returns an empty list."""
    res = client.get("/history", headers=auth_header(user1))
    assert res.status_code == 200
    assert res.json() == {"items": []}


@pytest.mark.asyncio
async def test_multiple_runs_create_multiple_history_records(client, user1, sample_system):
    """13. Multiple runs create multiple history records."""
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Run1", "company_name": "Company1"}},
        headers=auth_header(user1),
    )
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Run2", "company_name": "Company2"}},
        headers=auth_header(user1),
    )
    client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Run3", "company_name": "Company3"}},
        headers=auth_header(user1),
    )

    res = client.get("/history", headers=auth_header(user1))
    items = res.json()["items"]
    assert len(items) == 3
    # Check ordering (most recent first)
    assert "Run3" in items[0]["final_prompt"]
    assert "Run2" in items[1]["final_prompt"]
    assert "Run1" in items[2]["final_prompt"]


@pytest.mark.asyncio
async def test_old_history_remains_unchanged_after_prompt_system_is_edited(client, user1, sample_system, db_session):
    """14. Old history remains unchanged after Prompt System is edited."""
    # Run 1 with original system
    res_run1 = client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "Original", "company_name": "OriginalCorp"}},
        headers=auth_header(user1),
    )
    original_final_prompt = res_run1.json()["resolved_prompt"]

    # Now edit the prompt system instructions and name
    sample_system.name = "Updated Assistant Name"
    sample_system.instructions = "Completely new format: Hey {{prospect_name}} of {{company_name}}!"
    await db_session.commit()

    # Run 2 with updated system
    res_run2 = client.post(
        f"/prompt-systems/{sample_system.id}/run",
        json={"variables": {"prospect_name": "NewUser", "company_name": "NewCorp"}},
        headers=auth_header(user1),
    )
    new_final_prompt = res_run2.json()["resolved_prompt"]
    assert "Completely new format" in new_final_prompt

    # Verify both history records exist and Run 1's final_prompt is unchanged
    res_hist = client.get("/history", headers=auth_header(user1))
    items = res_hist.json()["items"]
    assert len(items) == 2

    # Old run (items[1]) preserves the exact old prompt and old name snapshot
    assert items[1]["final_prompt"] == original_final_prompt
    assert items[1]["prompt_system_name"] == "BDE LinkedIn Client Outreach Assistant"
    assert "Completely new format" not in items[1]["final_prompt"]

    # New run (items[0]) has new prompt and new name snapshot
    assert items[0]["final_prompt"] == new_final_prompt
    assert items[0]["prompt_system_name"] == "Updated Assistant Name"
