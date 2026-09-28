"""Tests for Branch 13: Prompt Composer (pf-13/feature-backend/prompt-composer).

Covers:
- Test 1: PromptSystem with only instructions -> Final prompt contains instructions
- Test 2: PromptSystem with variables -> Variable placeholders remain ({topic})
- Test 3: PromptSystem with examples -> Examples appear in final prompt
- Test 4: PromptSystem with output_format string -> Output requirement appears correctly
- Test 5: PromptSystem with output_format dictionary -> Object information appears correctly
- Test 6: PromptSystem with output_format list -> List information appears correctly
- Test 7: PromptSystem with one enabled module -> Module instructions appear
- Test 8: PromptSystem with disabled module -> Disabled module does not appear
- Test 9: PromptSystem with multiple modules -> Modules appear in deterministic order
- Test 10: Module output contract -> Output contract appears
- Test 11: Input mapping -> Only configured context is represented
- Test 12: Output mapping -> Output placeholder/mapping is represented ({research_output})
- Test 13: User cannot compose another user's PromptSystem -> 403 Forbidden
- Test 14: Missing PromptSystem returns 404
- Test 15: Unauthenticated request returns 401
- Important Boundary Test: PromptSystem with instructions & topic var, Module with instructions,
  input_context=topic, and output_contract="Return research notes.".
  Assert final prompt contains all 3 and does not leak unconfigured parent info.
- Module ownership test: Referenced module owned by another user cannot be silently composed -> 403
"""
import pytest
from fastapi.testclient import TestClient
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

def test_1_prompt_system_with_only_instructions(client, auth_headers1):
    """Test 1: PromptSystem with only instructions. Expected: Final prompt contains instructions."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Instructions Only System",
            "instructions": "You are an expert technical writer specializing in distributed systems.",
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    data = compose_res.json()
    assert data["prompt_system_id"] == ps_id
    assert "SYSTEM INSTRUCTIONS" in data["prompt"]
    assert "You are an expert technical writer specializing in distributed systems." in data["prompt"]


def test_2_prompt_system_with_variables(client, auth_headers1):
    """Test 2: PromptSystem with variables. Expected: Variable placeholders remain ({topic}, {audience})."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Article System",
            "instructions": "Write an article about {topic} for {audience}.",
            "variables": [
                {"name": "topic", "label": "Topic", "type": "text", "required": True},
                {"name": "audience", "label": "Audience", "type": "text", "required": True},
            ],
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    # Variable placeholders must be preserved
    assert "{topic}" in prompt
    assert "{audience}" in prompt
    assert "Write an article about {topic} for {audience}." in prompt


def test_3_prompt_system_with_examples(client, auth_headers1):
    """Test 3: PromptSystem with examples. Expected: Examples appear in final prompt."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "System with Examples",
            "instructions": "Explain networking concepts clearly.",
            "examples": [
                {
                    "title": "Networking 101",
                    "input": "Topic: Kubernetes networking",
                    "expected": "Explain networking concepts clearly.",
                }
            ],
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "EXAMPLES" in prompt
    assert "Kubernetes networking" in prompt
    assert "Explain networking concepts clearly." in prompt


def test_4_prompt_system_with_output_format_string(client, auth_headers1):
    """Test 4: PromptSystem with output_format string. Expected: Output requirement appears correctly."""
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "Markdown System",
            "instructions": "Write an executive summary.",
            "output_format": "Return clean Markdown.",
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "OUTPUT REQUIREMENTS" in prompt
    assert "Return clean Markdown." in prompt


def test_5_prompt_system_with_output_format_dictionary(client, auth_headers1):
    """Test 5: PromptSystem with output_format dictionary. Expected: Object information appears correctly."""
    schema_dict = {
        "name": "string",
        "summary": "string",
    }
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "JSON Object System",
            "instructions": "Extract entity details.",
            "output_format": schema_dict,
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "OUTPUT REQUIREMENTS" in prompt
    assert '"name": "string"' in prompt
    assert '"summary": "string"' in prompt


def test_6_prompt_system_with_output_format_list(client, auth_headers1):
    """Test 6: PromptSystem with output_format list. Expected: List information appears correctly."""
    format_list = ["summary", "details", "next_steps"]
    create_res = client.post(
        "/prompt-systems",
        json={
            "name": "List Format System",
            "instructions": "Generate meeting minutes.",
            "output_format": format_list,
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    ps_id = create_res.json()["id"]

    compose_res = client.post(f"/prompt-systems/{ps_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "OUTPUT REQUIREMENTS" in prompt
    assert "summary" in prompt
    assert "details" in prompt
    assert "next_steps" in prompt


def test_7_prompt_system_with_one_enabled_module(client, auth_headers1):
    """Test 7: PromptSystem with one enabled module. Expected: Module instructions appear."""
    # Create module
    mod_res = client.post(
        "/modules",
        json={
            "name": "Research",
            "instructions": "Research the topic and provide structured findings.",
        },
        headers=auth_headers1,
    )
    assert mod_res.status_code == 201
    mod_id = mod_res.json()["id"]

    # Create system
    sys_res = client.post(
        "/prompt-systems",
        json={"name": "System with Research Module", "instructions": "You are a lead architect."},
        headers=auth_headers1,
    )
    assert sys_res.status_code == 201
    sys_id = sys_res.json()["id"]

    # Attach module
    attach_res = client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": mod_id, "enabled": True},
        headers=auth_headers1,
    )
    assert attach_res.status_code == 201

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "MODULE: Research" in prompt
    assert "Research the topic and provide structured findings." in prompt


def test_8_prompt_system_with_disabled_module(client, auth_headers1):
    """Test 8: PromptSystem with disabled module. Expected: Disabled module does not appear."""
    # Create enabled Research module
    res_mod = client.post(
        "/modules",
        json={"name": "Research", "instructions": "Research {topic}."},
        headers=auth_headers1,
    ).json()["id"]

    # Create disabled Critic module
    critic_mod = client.post(
        "/modules",
        json={"name": "Critic", "instructions": "Review research and find flaws."},
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Pipeline", "instructions": "System instructions."},
        headers=auth_headers1,
    ).json()["id"]

    # Attach Research enabled
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": res_mod, "enabled": True},
        headers=auth_headers1,
    )

    # Attach Critic disabled
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": critic_mod, "enabled": False},
        headers=auth_headers1,
    )

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "MODULE: Research" in prompt
    assert "Research {topic}." in prompt
    assert "MODULE: Critic" not in prompt
    assert "Review research and find flaws." not in prompt


def test_9_prompt_system_with_multiple_modules_ordering(client, auth_headers1):
    """Test 9: Multiple modules appear in deterministic reference creation order."""
    mod1_id = client.post(
        "/modules",
        json={"name": "Module Alpha", "instructions": "Alpha instructions."},
        headers=auth_headers1,
    ).json()["id"]

    mod2_id = client.post(
        "/modules",
        json={"name": "Module Beta", "instructions": "Beta instructions."},
        headers=auth_headers1,
    ).json()["id"]

    mod3_id = client.post(
        "/modules",
        json={"name": "Module Gamma", "instructions": "Gamma instructions."},
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Multi Module System", "instructions": "Pipeline."},
        headers=auth_headers1,
    ).json()["id"]

    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod1_id, "enabled": True}, headers=auth_headers1)
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod2_id, "enabled": True}, headers=auth_headers1)
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod3_id, "enabled": True}, headers=auth_headers1)

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    pos_alpha = prompt.find("MODULE: Module Alpha")
    pos_beta = prompt.find("MODULE: Module Beta")
    pos_gamma = prompt.find("MODULE: Module Gamma")

    assert pos_alpha != -1
    assert pos_beta != -1
    assert pos_gamma != -1
    assert pos_alpha < pos_beta < pos_gamma


def test_10_module_output_contract(client, auth_headers1):
    """Test 10: Module output contract. Expected: Output contract appears."""
    mod_id = client.post(
        "/modules",
        json={
            "name": "ContractModule",
            "instructions": "Process data.",
            "output_contract": "Return structured research notes containing key facts and open questions.",
        },
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Contract System", "instructions": "System instructions."},
        headers=auth_headers1,
    ).json()["id"]

    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": mod_id, "enabled": True},
        headers=auth_headers1,
    )

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "OUTPUT CONTRACT:" in prompt
    assert "Return structured research notes containing key facts and open questions." in prompt


def test_11_input_mapping(client, auth_headers1):
    """Test 11: Input mapping. Expected: Only configured context is represented."""
    mod_id = client.post(
        "/modules",
        json={
            "name": "ScopedResearch",
            "instructions": "Research {topic}.",
        },
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={
            "name": "Scoped System",
            "instructions": "System instructions.",
            "variables": [
                {"name": "topic", "type": "text"},
                {"name": "unrelated_secret", "type": "text"},
            ],
        },
        headers=auth_headers1,
    ).json()["id"]

    # Map only topic to target_audience
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={
            "module_id": mod_id,
            "input_mapping": {"topic": "topic", "audience": "target_audience"},
            "enabled": True,
        },
        headers=auth_headers1,
    )

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    # In module section, only configured context appears
    module_section = prompt[prompt.find("MODULE: ScopedResearch"):]
    assert "INPUT CONTEXT:" in module_section
    assert "topic: {topic}" in module_section
    assert "audience: {target_audience}" in module_section
    assert "unrelated_secret" not in module_section


def test_12_output_mapping(client, auth_headers1):
    """Test 12: Output mapping. Expected: Output placeholder/mapping is represented."""
    mod_id = client.post(
        "/modules",
        json={
            "name": "ResearchModule",
            "instructions": "Perform research.",
        },
        headers=auth_headers1,
    ).json()["id"]

    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Output Map System", "instructions": "System."},
        headers=auth_headers1,
    ).json()["id"]

    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={
            "module_id": mod_id,
            "output_mapping": {"research": "research_output"},
            "enabled": True,
        },
        headers=auth_headers1,
    )

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "{research_output}" in prompt


def test_13_user_cannot_compose_another_users_system(client, auth_headers1, auth_headers2):
    """Test 13: User cannot compose another user's PromptSystem -> 403 Forbidden."""
    sys_id = client.post(
        "/prompt-systems",
        json={"name": "User 1 Private System", "instructions": "Confidential."},
        headers=auth_headers1,
    ).json()["id"]

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers2)
    assert compose_res.status_code == 403
    assert "permission" in compose_res.json()["detail"].lower()


def test_14_missing_prompt_system_returns_404(client, auth_headers1):
    """Test 14: Missing PromptSystem returns 404."""
    compose_res = client.post("/prompt-systems/999999/compose", headers=auth_headers1)
    assert compose_res.status_code == 404
    assert "not found" in compose_res.json()["detail"].lower()


def test_15_unauthenticated_request_returns_401(client, auth_headers1):
    """Test 15: Unauthenticated request returns 401."""
    sys_id = client.post(
        "/prompt-systems",
        json={"name": "Open System", "instructions": "Instructions."},
        headers=auth_headers1,
    ).json()["id"]

    # Request without Authorization header
    compose_res = client.post(f"/prompt-systems/{sys_id}/compose")
    assert compose_res.status_code == 401


def test_important_boundary_test(client, auth_headers1):
    """Important Boundary Test from specification:
    PromptSystem:
      Core Instructions: "You are a technical writer."
      Variables: topic
    Module:
      Research
      Module instructions: "Research {topic}."
      Module input_context: topic
      Module output_contract: "Return research notes."
    ModuleReference:
      enabled = true

    Expected final prompt contains:
      "You are a technical writer."
      "Research {topic}."
      "Return research notes."
    It must NOT automatically include unrelated parent information that was not configured for the module.
    """
    # Create module with input_context and output_contract
    mod_res = client.post(
        "/modules",
        json={
            "name": "Research",
            "instructions": "Research {topic}.",
            "input_context": ["topic"],
            "output_contract": "Return research notes.",
        },
        headers=auth_headers1,
    )
    assert mod_res.status_code == 201
    mod_id = mod_res.json()["id"]

    # Create PromptSystem with instructions, topic, and an unrelated variable
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": "Technical Writing System",
            "instructions": "You are a technical writer.",
            "variables": [
                {"name": "topic", "type": "text"},
                {"name": "internal_secret_token", "type": "text"},
            ],
        },
        headers=auth_headers1,
    )
    assert sys_res.status_code == 201
    sys_id = sys_res.json()["id"]

    # Attach module enabled
    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": mod_id, "enabled": True},
        headers=auth_headers1,
    )

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "You are a technical writer." in prompt
    assert "Research {topic}." in prompt
    assert "Return research notes." in prompt

    # Verify boundary: module section must not include unrelated parent information
    module_section = prompt[prompt.find("MODULE: Research"):]
    assert "internal_secret_token" not in module_section
    assert "You are a technical writer." not in module_section


async def test_cannot_compose_system_with_foreign_private_module(client, auth_headers1, auth_headers2, db_session):
    """Security test: Cannot silently compose a system referencing a module owned by another user."""
    # User B creates private module
    mod_res = client.post(
        "/modules",
        json={"name": "User B Secret Module", "instructions": "Secret steps."},
        headers=auth_headers2,
    )
    assert mod_res.status_code == 201
    user2_mod_id = mod_res.json()["id"]

    # User A creates system
    sys_res = client.post(
        "/prompt-systems",
        json={"name": "User A System", "instructions": "Parent instructions."},
        headers=auth_headers1,
    )
    assert sys_res.status_code == 201
    user1_sys_id = sys_res.json()["id"]

    # Manually inject reference to user2's module (simulating bypassed attachment or DB tamper)
    malicious_ref = ModuleReference(
        prompt_system_id=user1_sys_id,
        module_id=user2_mod_id,
        enabled=True,
    )
    db_session.add(malicious_ref)
    await db_session.commit()

    # User A attempts to compose
    compose_res = client.post(f"/prompt-systems/{user1_sys_id}/compose", headers=auth_headers1)
    assert compose_res.status_code == 403
    assert f"module id {user2_mod_id}" in compose_res.json()["detail"].lower()
