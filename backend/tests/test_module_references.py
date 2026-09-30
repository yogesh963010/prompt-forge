"""Tests for Branch 11: ModuleReference — module boundaries and reusability.

Covers:
  - Attach module to PromptSystem
  - List module references
  - Update module reference (input_mapping, output_mapping, enabled)
  - Delete module reference (module itself must survive)
  - disabled module stored with enabled=false
  - input_mapping stored and retrieved correctly
  - output_mapping stored and retrieved correctly
  - Same module reused by multiple PromptSystems
  - Deleting reference does NOT delete PromptModule
  - Cross-user ownership enforcement
  - Non-existent resource 404s
  - Unauthenticated requests rejected
  - JSON mappings survive DB round-trip
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
    """Create and persist User A."""
    u = User(
        name="User A",
        email="usera@test.io",
        password_hash="$2b$12$hashedpassword_usera",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user2(db_session):
    """Create and persist User B."""
    u = User(
        name="User B",
        email="userb@test.io",
        password_hash="$2b$12$hashedpassword_userb",
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
async def system_a(db_session, user1):
    """PromptSystem A owned by User A."""
    ps = PromptSystem(
        name="System A",
        owner_id=user1.id,
        instructions="Write about {topic}.",
        version=1,
        archived=False,
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def system_b(db_session, user1):
    """PromptSystem B owned by User A."""
    ps = PromptSystem(
        name="System B",
        owner_id=user1.id,
        instructions="Summarize {topic}.",
        version=1,
        archived=False,
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def system_c(db_session, user2):
    """PromptSystem C owned by User B."""
    ps = PromptSystem(
        name="System C",
        owner_id=user2.id,
        instructions="Explain {topic}.",
        version=1,
        archived=False,
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def research_module(db_session, user1):
    """Research PromptModule owned by User A."""
    m = PromptModule(
        name="Research",
        description="Researches a topic.",
        instructions="Research {topic} thoroughly.",
        owner_id=user1.id,
        input_context=["parent_variables"],
        output_contract="Return concise research findings.",
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.fixture
async def writer_module(db_session, user1):
    """Writer PromptModule owned by User A."""
    m = PromptModule(
        name="Writer",
        description="Writes content from research.",
        instructions="Write an article about {topic} using {research}.",
        owner_id=user1.id,
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


@pytest.fixture
async def user2_module(db_session, user2):
    """A PromptModule owned exclusively by User B."""
    m = PromptModule(
        name="User B Private Module",
        owner_id=user2.id,
    )
    db_session.add(m)
    await db_session.commit()
    await db_session.refresh(m)
    return m


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def attach_url(system_id: int) -> str:
    return f"/prompt-systems/{system_id}/modules"


def ref_url(system_id: int, ref_id: int) -> str:
    return f"/prompt-systems/{system_id}/modules/{ref_id}"


# ---------------------------------------------------------------------------
# Test 1: Attach module to PromptSystem
# ---------------------------------------------------------------------------

def test_1_attach_module_to_prompt_system(client, user1, system_a, research_module, auth_headers1):
    """Attaching a module creates a ModuleReference with correct fields."""
    payload = {
        "module_id": research_module.id,
        "input_mapping": {"topic": "article_topic"},
        "output_mapping": {"research": "research_output"},
        "enabled": True,
    }
    resp = client.post(attach_url(system_a.id), json=payload, headers=auth_headers1)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["module_id"] == research_module.id
    assert data["prompt_system_id"] == system_a.id
    assert data["module_name"] == "Research"
    assert data["input_mapping"] == {"topic": "article_topic"}
    assert data["output_mapping"] == {"research": "research_output"}
    assert data["enabled"] is True
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


# ---------------------------------------------------------------------------
# Test 2: List module references
# ---------------------------------------------------------------------------

def test_2_list_module_references(client, user1, system_a, research_module, writer_module, auth_headers1):
    """Listing returns all references attached to the system."""
    client.post(attach_url(system_a.id), json={"module_id": research_module.id}, headers=auth_headers1)
    client.post(attach_url(system_a.id), json={"module_id": writer_module.id}, headers=auth_headers1)

    resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    module_ids = {ref["module_id"] for ref in data}
    assert research_module.id in module_ids
    assert writer_module.id in module_ids


# ---------------------------------------------------------------------------
# Test 3: Update module reference
# ---------------------------------------------------------------------------

def test_3_update_module_reference(client, user1, system_a, research_module, auth_headers1):
    """PATCH can update input_mapping, output_mapping, and enabled."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id, "enabled": True},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]

    update_payload = {
        "input_mapping": {"topic": "new_topic_var"},
        "output_mapping": {"research": "new_context"},
        "enabled": False,
    }
    patch_resp = client.patch(ref_url(system_a.id, ref_id), json=update_payload, headers=auth_headers1)
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["input_mapping"] == {"topic": "new_topic_var"}
    assert data["output_mapping"] == {"research": "new_context"}
    assert data["enabled"] is False
    # Immutable fields unchanged
    assert data["module_id"] == research_module.id
    assert data["prompt_system_id"] == system_a.id


# ---------------------------------------------------------------------------
# Test 4: Delete module reference
# ---------------------------------------------------------------------------

def test_4_delete_module_reference(client, user1, system_a, research_module, auth_headers1):
    """DELETE removes the reference; the module itself is not deleted."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]

    del_resp = client.delete(ref_url(system_a.id, ref_id), headers=auth_headers1)
    assert del_resp.status_code == 200
    assert del_resp.json()["id"] == ref_id

    # Reference is no longer present in the list
    list_resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    assert list_resp.status_code == 200
    assert all(r["id"] != ref_id for r in list_resp.json())


# ---------------------------------------------------------------------------
# Test 5: Disabled module reference stored with enabled=false
# ---------------------------------------------------------------------------

def test_5_disabled_module_reference_is_stored(client, user1, system_a, research_module, auth_headers1):
    """Creating a reference with enabled=false persists that value."""
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id, "enabled": False},
        headers=auth_headers1,
    )
    assert resp.status_code == 201
    assert resp.json()["enabled"] is False


# ---------------------------------------------------------------------------
# Test 6: input_mapping survives DB round-trip
# ---------------------------------------------------------------------------

def test_6_input_mapping_stored_and_retrieved(client, user1, system_a, research_module, auth_headers1):
    """input_mapping JSON is stored and returned without mutation."""
    mapping = {"topic": "article_topic", "audience": "target_audience"}
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id, "input_mapping": mapping},
        headers=auth_headers1,
    )
    assert resp.status_code == 201
    ref_id = resp.json()["id"]

    # Retrieve via list
    list_resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    ref = next(r for r in list_resp.json() if r["id"] == ref_id)
    assert ref["input_mapping"] == mapping


# ---------------------------------------------------------------------------
# Test 7: output_mapping survives DB round-trip
# ---------------------------------------------------------------------------

def test_7_output_mapping_stored_and_retrieved(client, user1, system_a, research_module, auth_headers1):
    """output_mapping JSON is stored and returned without mutation."""
    mapping = {"research": "research_context", "summary": "brief_summary"}
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id, "output_mapping": mapping},
        headers=auth_headers1,
    )
    assert resp.status_code == 201
    ref_id = resp.json()["id"]

    list_resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    ref = next(r for r in list_resp.json() if r["id"] == ref_id)
    assert ref["output_mapping"] == mapping


# ---------------------------------------------------------------------------
# Test 8: Same module reused by multiple PromptSystems (core reusability test)
# ---------------------------------------------------------------------------

def test_8_same_module_reused_by_multiple_systems(
    client, user1, system_a, system_b, research_module, auth_headers1
):
    """One PromptModule → Two ModuleReferences; module is NOT duplicated."""
    resp_a = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    resp_b = client.post(
        attach_url(system_b.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    assert resp_a.status_code == 201
    assert resp_b.status_code == 201

    ref_a = resp_a.json()
    ref_b = resp_b.json()

    # Both references point to the SAME module_id — no duplication
    assert ref_a["module_id"] == research_module.id
    assert ref_b["module_id"] == research_module.id

    # They are different reference records
    assert ref_a["id"] != ref_b["id"]
    assert ref_a["prompt_system_id"] == system_a.id
    assert ref_b["prompt_system_id"] == system_b.id


# ---------------------------------------------------------------------------
# Test 9: Deleting reference does NOT delete PromptModule
# ---------------------------------------------------------------------------

def test_9_deleting_reference_does_not_delete_module(
    client, user1, system_a, research_module, auth_headers1
):
    """After deleting a ModuleReference, the PromptModule still exists."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]

    # Delete the reference
    client.delete(ref_url(system_a.id, ref_id), headers=auth_headers1)

    # Module still exists via its own CRUD endpoint
    module_resp = client.get(f"/modules/{research_module.id}", headers=auth_headers1)
    assert module_resp.status_code == 200
    assert module_resp.json()["name"] == "Research"


# ---------------------------------------------------------------------------
# Test 10: User cannot attach another user's PromptModule
# ---------------------------------------------------------------------------

def test_10_user_cannot_attach_another_users_module(
    client, user1, system_a, user2_module, auth_headers1
):
    """User A cannot attach a module owned by User B."""
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": user2_module.id},
        headers=auth_headers1,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 11: User cannot modify another user's ModuleReference
# ---------------------------------------------------------------------------

def test_11_user_cannot_modify_another_users_reference(
    client, user1, user2, system_a, system_c, research_module, user2_module,
    auth_headers1, auth_headers2
):
    """User B cannot PATCH a ModuleReference on User A's PromptSystem."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]

    # User B tries to PATCH it
    patch_resp = client.patch(
        ref_url(system_a.id, ref_id),
        json={"enabled": False},
        headers=auth_headers2,
    )
    assert patch_resp.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Test 12: User cannot delete another user's ModuleReference
# ---------------------------------------------------------------------------

def test_12_user_cannot_delete_another_users_reference(
    client, user1, user2, system_a, research_module, auth_headers1, auth_headers2
):
    """User B cannot DELETE a ModuleReference on User A's PromptSystem."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]

    del_resp = client.delete(ref_url(system_a.id, ref_id), headers=auth_headers2)
    assert del_resp.status_code in (403, 404)

    # Reference still exists
    list_resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    assert any(r["id"] == ref_id for r in list_resp.json())


# ---------------------------------------------------------------------------
# Test 13: Non-existent PromptSystem returns 404
# ---------------------------------------------------------------------------

def test_13_non_existent_prompt_system_returns_404(client, user1, research_module, auth_headers1):
    """POST/GET on a non-existent PromptSystem returns 404."""
    resp = client.post(
        attach_url(99999),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()

    resp2 = client.get(attach_url(99999), headers=auth_headers1)
    assert resp2.status_code == 404


# ---------------------------------------------------------------------------
# Test 14: Non-existent PromptModule returns 404
# ---------------------------------------------------------------------------

def test_14_non_existent_prompt_module_returns_404(client, user1, system_a, auth_headers1):
    """Attaching a non-existent module returns 404."""
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": 99999},
        headers=auth_headers1,
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 15: Non-existent ModuleReference returns 404
# ---------------------------------------------------------------------------

def test_15_non_existent_module_reference_returns_404(client, user1, system_a, auth_headers1):
    """PATCH and DELETE on a non-existent ModuleReference return 404."""
    patch_resp = client.patch(
        ref_url(system_a.id, 99999),
        json={"enabled": False},
        headers=auth_headers1,
    )
    assert patch_resp.status_code == 404

    del_resp = client.delete(ref_url(system_a.id, 99999), headers=auth_headers1)
    assert del_resp.status_code == 404


# ---------------------------------------------------------------------------
# Test 16: Unauthenticated requests are rejected
# ---------------------------------------------------------------------------

def test_16_unauthenticated_requests_rejected(client, system_a, research_module):
    """All endpoints require authentication — no token → 401."""
    resp_post = client.post(attach_url(system_a.id), json={"module_id": research_module.id})
    assert resp_post.status_code == 401

    resp_get = client.get(attach_url(system_a.id))
    assert resp_get.status_code == 401

    resp_patch = client.patch(ref_url(system_a.id, 1), json={"enabled": False})
    assert resp_patch.status_code == 401

    resp_delete = client.delete(ref_url(system_a.id, 1))
    assert resp_delete.status_code == 401


# ---------------------------------------------------------------------------
# Test 17: JSON mappings survive database save/load correctly
# ---------------------------------------------------------------------------

async def test_17_json_mappings_survive_db_roundtrip(db_session, user1, system_a, research_module):
    """Direct DB test: input_mapping and output_mapping are stored as JSON faithfully."""
    input_map = {"topic": "article_topic", "audience": "target_audience"}
    output_map = {"research": "research_context", "summary": "brief_summary"}

    ref = ModuleReference(
        prompt_system_id=system_a.id,
        module_id=research_module.id,
        input_mapping=input_map,
        output_mapping=output_map,
        enabled=True,
    )
    db_session.add(ref)
    await db_session.commit()
    await db_session.refresh(ref)

    # Re-query with SQLAlchemy 2.0 select()
    stmt = select(ModuleReference).where(ModuleReference.id == ref.id)
    result = await db_session.execute(stmt)
    persisted = result.scalar_one_or_none()

    assert persisted is not None
    assert persisted.input_mapping == input_map
    assert persisted.output_mapping == output_map
    assert persisted.enabled is True
    assert persisted.prompt_system_id == system_a.id
    assert persisted.module_id == research_module.id


# ---------------------------------------------------------------------------
# Test 18: Duplicate attachment returns 409
# ---------------------------------------------------------------------------

def test_18_duplicate_attachment_returns_409(client, user1, system_a, research_module, auth_headers1):
    """Attaching the same module twice to the same system returns 409 Conflict."""
    payload = {"module_id": research_module.id}
    resp1 = client.post(attach_url(system_a.id), json=payload, headers=auth_headers1)
    assert resp1.status_code == 201

    resp2 = client.post(attach_url(system_a.id), json=payload, headers=auth_headers1)
    assert resp2.status_code == 409
    assert "already attached" in resp2.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 19: Enable/disable toggle via PATCH
# ---------------------------------------------------------------------------

def test_19_enable_disable_toggle(client, user1, system_a, research_module, auth_headers1):
    """enabled field can be toggled between true and false via PATCH."""
    create_resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id, "enabled": True},
        headers=auth_headers1,
    )
    ref_id = create_resp.json()["id"]
    assert create_resp.json()["enabled"] is True

    # Disable
    patch_resp = client.patch(
        ref_url(system_a.id, ref_id),
        json={"enabled": False},
        headers=auth_headers1,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["enabled"] is False

    # Re-enable
    patch_resp2 = client.patch(
        ref_url(system_a.id, ref_id),
        json={"enabled": True},
        headers=auth_headers1,
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["enabled"] is True


# ---------------------------------------------------------------------------
# Test 20: module_name appears in response
# ---------------------------------------------------------------------------

def test_20_module_name_in_response(client, user1, system_a, research_module, auth_headers1):
    """ModuleReferenceResponse includes module_name from the linked PromptModule."""
    resp = client.post(
        attach_url(system_a.id),
        json={"module_id": research_module.id},
        headers=auth_headers1,
    )
    assert resp.status_code == 201
    assert resp.json()["module_name"] == "Research"

    list_resp = client.get(attach_url(system_a.id), headers=auth_headers1)
    refs = list_resp.json()
    assert refs[0]["module_name"] == "Research"
