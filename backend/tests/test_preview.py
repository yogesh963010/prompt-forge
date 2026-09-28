"""Tests for Branch 14: Prompt Preview (pf-14/feature-backend/prompt-preview).

Covers:
- Test 1: Preview authenticated PromptSystem returns 200 with raw and structured views
- Test 2: Preview another user's PromptSystem is rejected with 403 Forbidden
- Test 3: Missing PromptSystem returns 404
- Test 4: Raw prompt is returned matching deterministic composer output
- Test 5: Structured prompt is returned with instructions, variables, examples, modules, output_requirements
- Test 6: Enabled modules appear in both raw and structured views
- Test 7: Disabled modules do NOT appear in raw or structured views
- Test 8: Variables remain unresolved ({topic}, {audience})
- Test 9: Output format is represented correctly (string, dict, and list)
- Test 10: Unauthenticated request returns 401
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
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
        email="usera@promptforge.io",
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
        email="userb@promptforge.io",
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_1_preview_authenticated_prompt_system(client, auth_headers1):
    """Test 1: Preview authenticated PromptSystem returns 200 with raw and structured views."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Preview Test System",
            "instructions": "You are an expert technical writer.",
            "variables": [
                {"name": "topic", "type": "text"},
            ],
            "output_format": "Return clean Markdown.",
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    res = client.post(f"/prompt-systems/{ps_id}/preview", headers=auth_headers1)
    assert res.status_code == 200
    data = res.json()
    assert data["prompt_system_id"] == ps_id
    assert "raw_prompt" in data
    assert "structured_prompt" in data
    assert "You are an expert technical writer." in data["raw_prompt"]
    assert data["structured_prompt"]["instructions"] == "You are an expert technical writer."


def test_2_preview_another_user_system_rejected(client, auth_headers1, auth_headers2):
    """Test 2: Preview another user's PromptSystem is rejected with 403 Forbidden."""
    create_res = client.post(
        "/prompt-systems",
        json={"name": "User 1 Private System", "instructions": "Secret instructions."},
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    # User 2 attempts to preview User 1's system
    res = client.post(f"/prompt-systems/{ps_id}/preview", headers=auth_headers2)
    assert res.status_code == 403
    assert "permission" in res.json()["detail"].lower()


def test_3_preview_missing_prompt_system_returns_404(client, auth_headers1):
    """Test 3: Missing PromptSystem returns 404."""
    res = client.post("/prompt-systems/99999/preview", headers=auth_headers1)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_4_raw_prompt_is_returned(client, auth_headers1):
    """Test 4: Raw prompt is returned matching deterministic composer output."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Raw Prompt System",
            "instructions": "Write an article about {topic} for {audience}.",
            "variables": [
                {"name": "topic", "type": "text"},
                {"name": "audience", "type": "text"},
            ],
            "output_format": "Clean format.",
        },
        headers=auth_headers1,
    )
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    preview_res = client.post(f"/prompt-systems/{ps_id}/preview", headers=auth_headers1)

    assert compose_res.status_code == 200
    assert preview_res.status_code == 200

    # raw_prompt in preview matches composer output exactly
    assert preview_res.json()["raw_prompt"] == compose_res.json()["prompt"]


def test_5_structured_prompt_is_returned(client, auth_headers1):
    """Test 5: Structured prompt is returned with all expected section keys."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Structured Prompt System",
            "instructions": "Core instructions.",
            "variables": [{"name": "topic", "type": "text"}],
            "examples": [{"title": "Example 1", "input": "Input text", "expected": "Output text"}],
            "output_format": "Markdown",
        },
        headers=auth_headers1,
    )
    ps_id = create_res.json()["id"]

    preview_res = client.post(f"/prompt-systems/{ps_id}/preview", headers=auth_headers1)
    assert preview_res.status_code == 200
    structured = preview_res.json()["structured_prompt"]

    assert structured["instructions"] == "Core instructions."
    assert len(structured["variables"]) == 1
    assert structured["variables"][0]["name"] == "topic"
    assert len(structured["examples"]) == 1
    assert structured["examples"][0]["input"] == "Input text"
    assert structured["output_requirements"] == "Markdown"


def test_6_enabled_modules_appear_in_preview(client, auth_headers1):
    """Test 6: Enabled modules appear in both raw and structured views."""
    # Create module
    mod_id = client.post(
        "/modules",
        json={
            "name": "Research",
            "instructions": "Research {topic}.",
            "output_contract": "Return research notes.",
        },
        headers=auth_headers1,
    ).json()["id"]

    # Create system
    sys_id = client.post(
        "/prompt-systems",
        json={"name": "System with Module", "instructions": "System instructions."},
        headers=auth_headers1,
    ).json()["id"]

    # Attach module enabled
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={
            "module_id": mod_id,
            "input_mapping": {"topic": "topic"},
            "output_mapping": {"research": "research_output"},
            "enabled": True,
        },
        headers=auth_headers1,
    )

    preview_res = client.post(f"/prompt-systems/{sys_id}/preview", headers=auth_headers1)
    assert preview_res.status_code == 200
    data = preview_res.json()

    # Raw prompt verification
    assert "MODULE: Research" in data["raw_prompt"]
    assert "Research {topic}." in data["raw_prompt"]
    assert "Return research notes." in data["raw_prompt"]

    # Structured prompt verification
    modules = data["structured_prompt"]["modules"]
    assert len(modules) == 1
    assert modules[0]["name"] == "Research"
    assert modules[0]["instructions"] == "Research {topic}."
    assert modules[0]["output_contract"] == "Return research notes."
    assert modules[0]["input_context"] == {"topic": "topic"}
    assert modules[0]["output_mapping"] == {"research": "research_output"}


def test_7_disabled_modules_do_not_appear_in_preview(client, auth_headers1):
    """Test 7: Disabled modules do NOT appear in raw or structured views."""
    res_mod_id = client.post(
        "/modules",
        json={"name": "Active Research", "instructions": "Active instructions."},
        headers=auth_headers1,
    ).json()["id"]

    disabled_mod_id = client.post(
        "/modules",
        json={"name": "Disabled Critic", "instructions": "Disabled instructions."},
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={"name": "System with Mixed Modules", "instructions": "Instructions."},
        headers=auth_headers1,
    ).json()["id"]

    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": res_mod_id, "enabled": True},
        headers=auth_headers1,
    )
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": disabled_mod_id, "enabled": False},
        headers=auth_headers1,
    )

    preview_res = client.post(f"/prompt-systems/{sys_id}/preview", headers=auth_headers1)
    assert preview_res.status_code == 200
    data = preview_res.json()

    # Raw prompt check
    assert "MODULE: Active Research" in data["raw_prompt"]
    assert "MODULE: Disabled Critic" not in data["raw_prompt"]

    # Structured prompt check
    modules = data["structured_prompt"]["modules"]
    assert len(modules) == 1
    assert modules[0]["name"] == "Active Research"
    assert not any(m["name"] == "Disabled Critic" for m in modules)


def test_8_variables_remain_unresolved_in_preview(client, auth_headers1):
    """Test 8: Variables remain unresolved ({topic}, {audience})."""
    sys_id = client.post(
        "/prompt-systems",
        json={
            "name": "Placeholder System",
            "instructions": "Write about {topic} for {audience}.",
            "variables": [
                {"name": "topic", "type": "text"},
                {"name": "audience", "type": "text"},
            ],
        },
        headers=auth_headers1,
    ).json()["id"]

    preview_res = client.post(f"/prompt-systems/{sys_id}/preview", headers=auth_headers1)
    assert preview_res.status_code == 200
    raw = preview_res.json()["raw_prompt"]

    assert "{topic}" in raw
    assert "{audience}" in raw


def test_9_output_format_variations(client, auth_headers1):
    """Test 9: Output format is represented correctly (string, dict, list)."""
    # 1. String
    s1 = client.post(
        "/prompt-systems",
        json={"name": "S1", "instructions": "I", "output_format": "Return clean Markdown."},
        headers=auth_headers1,
    ).json()["id"]
    p1 = client.post(f"/prompt-systems/{s1}/preview", headers=auth_headers1).json()
    assert "Return clean Markdown." in p1["raw_prompt"]
    assert p1["structured_prompt"]["output_requirements"] == "Return clean Markdown."

    # 2. Dictionary
    schema_dict = {"name": "string", "summary": "string"}
    s2 = client.post(
        "/prompt-systems",
        json={"name": "S2", "instructions": "I", "output_format": schema_dict},
        headers=auth_headers1,
    ).json()["id"]
    p2 = client.post(f"/prompt-systems/{s2}/preview", headers=auth_headers1).json()
    assert '"name": "string"' in p2["raw_prompt"]
    assert p2["structured_prompt"]["output_requirements"] == schema_dict

    # 3. List
    format_list = ["summary", "details"]
    s3 = client.post(
        "/prompt-systems",
        json={"name": "S3", "instructions": "I", "output_format": format_list},
        headers=auth_headers1,
    ).json()["id"]
    p3 = client.post(f"/prompt-systems/{s3}/preview", headers=auth_headers1).json()
    assert "summary" in p3["raw_prompt"]
    assert "details" in p3["raw_prompt"]
    assert p3["structured_prompt"]["output_requirements"] == format_list


def test_10_unauthenticated_request_returns_401(client, auth_headers1):
    """Test 10: Unauthenticated request returns 401."""
    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Open System", "instructions": "Instructions."},
        headers=auth_headers1,
    ).json()["id"]

    res = client.post(f"/prompt-systems/{sys_id}/preview")
    assert res.status_code == 401
