"""Tests for Prompt Modules CRUD APIs, authentication, authorization, and validation with async database."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
from backend.app.models.prompt_module import PromptModule
from backend.app.models.user import User
from backend.app.services.auth_service import create_access_token


@pytest.fixture
async def db_session():
    """Create a clean, isolated SQLite async in-memory database for testing."""
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
    """Provide a TestClient with overridden get_db dependency."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def user1(db_session):
    """Create User A asynchronously."""
    u1 = User(
        name="User A",
        email="usera@promptforge.io",
        password_hash="$2b$12$hashedpasswordforusera",
    )
    db_session.add(u1)
    await db_session.commit()
    await db_session.refresh(u1)
    return u1


@pytest.fixture
async def user2(db_session):
    """Create User B asynchronously."""
    u2 = User(
        name="User B",
        email="userb@promptforge.io",
        password_hash="$2b$12$hashedpasswordforuserb",
    )
    db_session.add(u2)
    await db_session.commit()
    await db_session.refresh(u2)
    return u2


@pytest.fixture
def auth_headers1(user1):
    """Generate JWT authorization headers for User A."""
    token = create_access_token(data={"sub": str(user1.id), "email": user1.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers2(user2):
    """Generate JWT authorization headers for User B."""
    token = create_access_token(data={"sub": str(user2.id), "email": user2.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def example_module_payload():
    """Standard sample payload specified by the feature definition."""
    return {
        "name": "Research",
        "description": "Researches a given topic.",
        "instructions": "Research {topic} and summarize the findings.",
        "variables": [
            {
                "name": "topic",
                "label": "Topic",
                "type": "text",
                "required": True,
                "default": "",
                "description": "Topic to research",
            }
        ],
        "input_context": ["parent_variables"],
        "output_contract": "Return concise research findings.",
        "examples": [
            {
                "input": "AI agents",
                "output": "Research findings about AI agents",
            }
        ],
    }


def test_1_create_module_successfully(client, user1, auth_headers1, example_module_payload):
    """Test 1: Create module successfully and verify ownership and response."""
    response = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["name"] == "Research"
    assert data["description"] == "Researches a given topic."
    assert data["instructions"] == "Research {topic} and summarize the findings."
    assert data["owner_id"] == user1.id
    assert data["output_contract"] == "Return concise research findings."
    assert len(data["variables"]) == 1
    assert data["variables"][0]["name"] == "topic"
    assert data["input_context"] == ["parent_variables"]
    assert len(data["examples"]) == 1
    assert data["examples"][0]["input"] == "AI agents"


def test_2_get_module_successfully(client, user1, auth_headers1, example_module_payload):
    """Test 2: Get module successfully by ID."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    get_resp = client.get(f"/modules/{module_id}", headers=auth_headers1)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["id"] == module_id
    assert data["name"] == "Research"
    assert data["owner_id"] == user1.id


def test_3_update_module_successfully(client, user1, auth_headers1, example_module_payload):
    """Test 3: Update module successfully via PATCH."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    update_payload = {
        "name": "Technical Research",
        "instructions": "Research the topic using reliable information.",
        "output_contract": "Return concise structured findings.",
    }
    patch_resp = client.patch(f"/modules/{module_id}", json=update_payload, headers=auth_headers1)
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["name"] == "Technical Research"
    assert data["instructions"] == "Research the topic using reliable information."
    assert data["output_contract"] == "Return concise structured findings."
    # Unchanged fields remain preserved
    assert data["description"] == "Researches a given topic."
    assert len(data["variables"]) == 1


def test_4_delete_module_successfully(client, user1, auth_headers1, example_module_payload):
    """Test 4: Delete module successfully and verify it is removed."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    del_resp = client.delete(f"/modules/{module_id}", headers=auth_headers1)
    assert del_resp.status_code == 200
    assert del_resp.json()["id"] == module_id

    # Verifying deletion
    get_resp = client.get(f"/modules/{module_id}", headers=auth_headers1)
    assert get_resp.status_code == 404


def test_5_unauthenticated_user_cannot_create_a_module(client, example_module_payload):
    """Test 5: Unauthenticated user cannot create, get, update, or delete a module."""
    # POST
    resp = client.post("/modules", json=example_module_payload)
    assert resp.status_code == 401

    # GET
    resp = client.get("/modules/1")
    assert resp.status_code == 401

    # PATCH
    resp = client.patch("/modules/1", json={"name": "New Name"})
    assert resp.status_code == 401

    # DELETE
    resp = client.delete("/modules/1")
    assert resp.status_code == 401


def test_6_user_cannot_access_another_users_module(client, user1, user2, auth_headers1, auth_headers2, example_module_payload):
    """Test 6: User B cannot access User A's module (returns 403)."""
    # User A creates Module A
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    # User B tries to GET Module A
    get_resp = client.get(f"/modules/{module_id}", headers=auth_headers2)
    assert get_resp.status_code == 403
    assert "permission" in get_resp.json()["detail"].lower()


def test_7_user_cannot_update_another_users_module(client, user1, user2, auth_headers1, auth_headers2, example_module_payload):
    """Test 7: User B cannot update User A's module (returns 403)."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/modules/{module_id}",
        json={"name": "Hijacked Module"},
        headers=auth_headers2,
    )
    assert patch_resp.status_code == 403
    assert "permission" in patch_resp.json()["detail"].lower()

    # Verify original module wasn't modified
    get_resp = client.get(f"/modules/{module_id}", headers=auth_headers1)
    assert get_resp.json()["name"] == "Research"


def test_8_user_cannot_delete_another_users_module(client, user1, user2, auth_headers1, auth_headers2, example_module_payload):
    """Test 8: User B cannot delete User A's module (returns 403)."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    del_resp = client.delete(f"/modules/{module_id}", headers=auth_headers2)
    assert del_resp.status_code == 403
    assert "permission" in del_resp.json()["detail"].lower()

    # Verify original module is still intact
    get_resp = client.get(f"/modules/{module_id}", headers=auth_headers1)
    assert get_resp.status_code == 200


def test_9_module_variables_are_stored_correctly(client, auth_headers1):
    """Test 9: Module variables with multiple types are stored correctly."""
    payload = {
        "name": "Multi-variable Module",
        "variables": [
            {
                "name": "topic",
                "label": "Topic",
                "type": "text",
                "required": True,
                "default": "AI",
                "description": "Topic to analyze",
            },
            {
                "name": "max_length",
                "label": "Max Length",
                "type": "number",
                "required": False,
                "default": 500,
                "description": "Max word count",
            },
        ],
    }
    resp = client.post("/modules", json=payload, headers=auth_headers1)
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["variables"]) == 2
    assert data["variables"][0]["name"] == "topic"
    assert data["variables"][1]["name"] == "max_length"
    assert data["variables"][1]["type"] == "number"


def test_10_input_context_is_stored_correctly(client, auth_headers1):
    """Test 10: input_context array is stored and returned correctly."""
    payload = {
        "name": "Context Module",
        "input_context": ["parent_variables", "parent_instructions", "previous_module_output"],
    }
    resp = client.post("/modules", json=payload, headers=auth_headers1)
    assert resp.status_code == 201
    data = resp.json()
    assert data["input_context"] == ["parent_variables", "parent_instructions", "previous_module_output"]


def test_11_examples_are_stored_correctly(client, auth_headers1):
    """Test 11: examples array of objects is stored and returned correctly."""
    examples = [
        {"input": "Artificial Intelligence", "output": "AI is the simulation of human intelligence."},
        {"input": "Quantum Computing", "output": "Quantum computing leverages qubits and superposition."},
    ]
    payload = {
        "name": "Examples Module",
        "examples": examples,
    }
    resp = client.post("/modules", json=payload, headers=auth_headers1)
    assert resp.status_code == 201
    data = resp.json()
    assert data["examples"] == examples


def test_12_output_contract_is_returned_correctly(client, auth_headers1):
    """Test 12: output_contract string or structured object is stored and returned correctly."""
    # Test string contract
    payload_str = {
        "name": "String Contract Module",
        "output_contract": "Return concise research findings with key facts and sources.",
    }
    resp1 = client.post("/modules", json=payload_str, headers=auth_headers1)
    assert resp1.status_code == 201
    assert resp1.json()["output_contract"] == "Return concise research findings with key facts and sources."

    # Test object contract
    payload_obj = {
        "name": "Structured Contract Module",
        "output_contract": {"format": "json", "schema": {"type": "object", "properties": {"summary": {"type": "string"}}}},
    }
    resp2 = client.post("/modules", json=payload_obj, headers=auth_headers1)
    assert resp2.status_code == 201
    assert resp2.json()["output_contract"]["format"] == "json"


def test_13_partial_update_works(client, auth_headers1, example_module_payload):
    """Test 13: Partial update updates only supplied fields and preserves others."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]

    # Update only description
    patch_resp = client.patch(
        f"/modules/{module_id}",
        json={"description": "Updated description only."},
        headers=auth_headers1,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["description"] == "Updated description only."
    assert data["name"] == "Research"
    assert data["instructions"] == "Research {topic} and summarize the findings."
    assert data["output_contract"] == "Return concise research findings."
    assert data["input_context"] == ["parent_variables"]


def test_14_non_existent_module_returns_404(client, auth_headers1):
    """Test 14: Non-existent module returns 404 for GET, PATCH, and DELETE."""
    non_existent_id = 999999

    get_resp = client.get(f"/modules/{non_existent_id}", headers=auth_headers1)
    assert get_resp.status_code == 404
    assert "not found" in get_resp.json()["detail"].lower()

    patch_resp = client.patch(
        f"/modules/{non_existent_id}",
        json={"name": "Ghost"},
        headers=auth_headers1,
    )
    assert patch_resp.status_code == 404

    del_resp = client.delete(f"/modules/{non_existent_id}", headers=auth_headers1)
    assert del_resp.status_code == 404


async def test_15_database_values_are_preserved_after_save_and_retrieval(db_session, user1):
    """Test 15: Direct database inspection confirms data integrity and types."""
    module = PromptModule(
        name="Direct DB Module",
        description="Verifying DB persistence directly",
        instructions="Step 1, Step 2",
        variables=[{"name": "x", "type": "number"}],
        input_context=["parent_variables"],
        output_contract="Text output",
        examples=[{"input": "1", "output": "2"}],
        owner_id=user1.id,
    )
    db_session.add(module)
    await db_session.commit()
    await db_session.refresh(module)

    # Query afresh using SQLAlchemy 2.0 select
    stmt = select(PromptModule).where(PromptModule.id == module.id)
    result = await db_session.execute(stmt)
    persisted = result.scalar_one_or_none()

    assert persisted is not None
    assert persisted.name == "Direct DB Module"
    assert persisted.description == "Verifying DB persistence directly"
    assert persisted.instructions == "Step 1, Step 2"
    assert persisted.variables == [{"name": "x", "type": "number"}]
    assert persisted.input_context == ["parent_variables"]
    assert persisted.output_contract == "Text output"
    assert persisted.examples == [{"input": "1", "output": "2"}]
    assert persisted.owner_id == user1.id
    assert persisted.created_at is not None
    assert persisted.updated_at is not None


def test_immutable_fields_cannot_be_overwritten(client, user1, user2, auth_headers1, example_module_payload):
    """Verify that id, owner_id, and created_at cannot be overwritten via PATCH."""
    create_resp = client.post("/modules", json=example_module_payload, headers=auth_headers1)
    module_id = create_resp.json()["id"]
    original_created_at = create_resp.json()["created_at"]

    patch_resp = client.patch(
        f"/modules/{module_id}",
        json={
            "id": 9999,
            "owner_id": user2.id,
            "created_at": "2000-01-01T00:00:00Z",
            "name": "Immutable Protection Test",
        },
        headers=auth_headers1,
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["id"] == module_id
    assert data["owner_id"] == user1.id
    assert data["created_at"] == original_created_at
    assert data["name"] == "Immutable Protection Test"


def test_list_modules_for_owner(client, user1, user2, auth_headers1, auth_headers2, example_module_payload):
    """Verify listing modules returns only the authenticated user's modules."""
    # User A creates 2 modules
    client.post("/modules", json={**example_module_payload, "name": "User A Mod 1"}, headers=auth_headers1)
    client.post("/modules", json={**example_module_payload, "name": "User A Mod 2"}, headers=auth_headers1)

    # User B creates 1 module
    client.post("/modules", json={**example_module_payload, "name": "User B Mod 1"}, headers=auth_headers2)

    # User A lists modules
    list_a = client.get("/modules", headers=auth_headers1)
    assert list_a.status_code == 200
    mods_a = list_a.json()
    assert len(mods_a) == 2
    assert all(m["owner_id"] == user1.id for m in mods_a)

    # User B lists modules
    list_b = client.get("/modules", headers=auth_headers2)
    assert list_b.status_code == 200
    mods_b = list_b.json()
    assert len(mods_b) == 1
    assert mods_b[0]["owner_id"] == user2.id
