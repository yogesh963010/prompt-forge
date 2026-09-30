"""Comprehensive test suite for Prompt Module Input Context / Boundary Selection.

Covers:
- Module creation with empty input_context ([])
- Module creation with single and multiple contexts
- Module update to empty ([]) and updated contexts
- Persistence in database
- Rejection of invalid context values (422)
- All 16 combinations of the 4 context options (parent_variables, parent_instructions, previous_module_output, user_input)
- Module's own instructions/configuration always preserved
- Multiple modules respecting individual boundaries (Module A with Parent Variables, Module B with Previous Output)
- Prompt Preview respecting boundary selections
- Prompt Run respecting boundary selections and variable resolution
- BDE Follow-Up real project scenario
"""
import itertools
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


@pytest.fixture
async def db_session():
    """Isolated async SQLite in-memory DB per test."""
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
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session):
    u = User(
        name="Test Engineer",
        email="engineer@promptforge.io",
        password_hash="$2b$12$hashedpassword_test",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers(test_user):
    token = create_access_token(data={"sub": str(test_user.id), "email": test_user.email})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Validation and Persistence Tests
# ---------------------------------------------------------------------------

def test_module_creation_empty_input_context(client, auth_headers):
    """Module creation with input_context=[] stores and returns []."""
    res = client.post(
        "/modules",
        json={
            "name": "Empty Context Module",
            "instructions": "Do something standalone.",
            "input_context": [],
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["input_context"] == []


def test_module_creation_default_none_becomes_empty(client, auth_headers):
    """When input_context is omitted or None, it defaults to []."""
    res = client.post(
        "/modules",
        json={
            "name": "Default Context Module",
            "instructions": "Standalone logic.",
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["input_context"] == []


def test_module_creation_invalid_context_rejected(client, auth_headers):
    """Invalid context value is rejected with 422."""
    res = client.post(
        "/modules",
        json={
            "name": "Bad Context Module",
            "instructions": "Test",
            "input_context": ["arbitrary_context", "parent_variables"],
        },
        headers=auth_headers,
    )
    assert res.status_code == 422
    assert "Invalid input_context" in res.text


def test_module_update_to_empty(client, auth_headers):
    """Updating a module with input_context=[] persists an empty list, not all."""
    create_res = client.post(
        "/modules",
        json={
            "name": "Switchable Module",
            "instructions": "Test",
            "input_context": ["parent_variables", "user_input"],
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    mod_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/modules/{mod_id}",
        json={"input_context": []},
        headers=auth_headers,
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["input_context"] == []

    get_res = client.get(f"/modules/{mod_id}", headers=auth_headers)
    assert get_res.status_code == 200
    assert get_res.json()["input_context"] == []


def test_module_update_invalid_context_rejected(client, auth_headers):
    """Updating a module with invalid context string is rejected with 422."""
    create_res = client.post(
        "/modules",
        json={"name": "Mod", "instructions": "I", "input_context": ["parent_variables"]},
        headers=auth_headers,
    )
    mod_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/modules/{mod_id}",
        json={"input_context": ["not_a_valid_option"]},
        headers=auth_headers,
    )
    assert patch_res.status_code == 422


# ---------------------------------------------------------------------------
# 2. All 16 Combinations Test
# ---------------------------------------------------------------------------

ALL_OPTIONS = [
    "parent_variables",
    "parent_instructions",
    "previous_module_output",
    "user_input",
]


@pytest.mark.parametrize(
    "combo",
    [
        combo
        for r in range(len(ALL_OPTIONS) + 1)
        for combo in itertools.combinations(ALL_OPTIONS, r)
    ],
)
def test_all_16_context_combinations(client, auth_headers, combo):
    """Test every single combination of the 4 context options (2^4 = 16 combinations).

    Verify that:
    - Selected context sources are PRESENT
    - Unselected context sources are ABSENT
    - Module's own instructions/configuration are ALWAYS present
    """
    selected = list(combo)

    # 1. Create a Prompt System with instructions and variables
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": f"System for combo {selected}",
            "instructions": "PARENT_INSTRUCTIONS_SECRET_CORE_PROMPT",
            "variables": [
                {"name": "parent_var_key", "type": "text"},
            ],
        },
        headers=auth_headers,
    )
    assert sys_res.status_code == 201
    sys_id = sys_res.json()["id"]

    # 2. Attach a preceding module so previous_module_output has a real upstream source
    prev_mod_res = client.post(
        "/modules",
        json={
            "name": "Upstream Worker",
            "instructions": "Generate upstream notes.",
            "output_contract": "Upstream summary result.",
        },
        headers=auth_headers,
    )
    assert prev_mod_res.status_code == 201
    prev_mod_id = prev_mod_res.json()["id"]

    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": prev_mod_id, "enabled": True},
        headers=auth_headers,
    )

    # 3. Create target module with the specific combination
    target_mod_res = client.post(
        "/modules",
        json={
            "name": "Target Boundary Module",
            "description": "Module under test for boundary selection",
            "instructions": "TARGET_MODULE_OWN_INSTRUCTIONS_HERE",
            "input_context": selected,
            "output_contract": "TARGET_MODULE_OUTPUT_CONTRACT",
        },
        headers=auth_headers,
    )
    assert target_mod_res.status_code == 201
    target_mod_id = target_mod_res.json()["id"]

    client.post(
        f"/prompt-systems/{sys_id}/modules",
        json={"module_id": target_mod_id, "enabled": True},
        headers=auth_headers,
    )

    # 4. Compose prompt
    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    # Target module section
    target_section_idx = prompt.find("MODULE: Target Boundary Module")
    assert target_section_idx != -1
    target_section = prompt[target_section_idx:]

    # A. Module's own configuration MUST always be present
    assert "MODULE: Target Boundary Module" in target_section
    assert "TARGET_MODULE_OWN_INSTRUCTIONS_HERE" in target_section
    assert "TARGET_MODULE_OUTPUT_CONTRACT" in target_section

    # B. Parent Variables boundary check
    if "parent_variables" in selected:
        assert "PARENT VARIABLES:" in target_section
        assert "parent_var_key: {parent_var_key}" in target_section
    else:
        assert "PARENT VARIABLES:" not in target_section
        assert "parent_var_key" not in target_section

    # C. Parent Instructions boundary check
    if "parent_instructions" in selected:
        assert "PARENT INSTRUCTIONS:" in target_section
        assert "PARENT_INSTRUCTIONS_SECRET_CORE_PROMPT" in target_section
    else:
        assert "PARENT INSTRUCTIONS:" not in target_section
        assert "PARENT_INSTRUCTIONS_SECRET_CORE_PROMPT" not in target_section

    # D. Previous Module Output boundary check
    if "previous_module_output" in selected:
        assert "PREVIOUS MODULE OUTPUT:" in target_section
        assert "{upstream_worker_output}" in target_section
    else:
        assert "PREVIOUS MODULE OUTPUT:" not in target_section
        assert "{upstream_worker_output}" not in target_section

    # E. User Input boundary check
    if "user_input" in selected:
        assert "USER INPUT:" in target_section
        assert "{user_input}" in target_section
    else:
        assert "USER INPUT:" not in target_section
        assert "{user_input}" not in target_section


# ---------------------------------------------------------------------------
# 3. Multiple Modules Boundary Isolation Test
# ---------------------------------------------------------------------------

def test_multiple_modules_respect_individual_boundaries(client, auth_headers):
    """Module A: Parent Variables only
    Module B: Previous Module Output only

    Expected:
    - Module A receives only Parent Variables, NOT Module B's output or previous output.
    - Module B receives only Previous Module Output (Module A's output), NOT Parent Variables.
    """
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": "Pipeline System",
            "instructions": "System instructions not selected by either.",
            "variables": [{"name": "pipeline_var", "type": "text"}],
        },
        headers=auth_headers,
    )
    sys_id = sys_res.json()["id"]

    # Module A: Parent Variables only
    mod_a_res = client.post(
        "/modules",
        json={
            "name": "Module A",
            "instructions": "Perform step A.",
            "input_context": ["parent_variables"],
        },
        headers=auth_headers,
    )
    mod_a_id = mod_a_res.json()["id"]

    # Module B: Previous Module Output only
    mod_b_res = client.post(
        "/modules",
        json={
            "name": "Module B",
            "instructions": "Perform step B using step A output.",
            "input_context": ["previous_module_output"],
        },
        headers=auth_headers,
    )
    mod_b_id = mod_b_res.json()["id"]

    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_a_id, "enabled": True}, headers=auth_headers)
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_b_id, "enabled": True}, headers=auth_headers)

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    pos_a = prompt.find("MODULE: Module A")
    pos_b = prompt.find("MODULE: Module B")
    assert pos_a != -1 and pos_b != -1
    section_a = prompt[pos_a:pos_b]
    section_b = prompt[pos_b:]

    # Module A receives Parent Variables, but NOT previous module output
    assert "PARENT VARIABLES:" in section_a
    assert "pipeline_var: {pipeline_var}" in section_a
    assert "PREVIOUS MODULE OUTPUT:" not in section_a
    assert "System instructions" not in section_a

    # Module B receives Previous Module Output, but NOT Parent Variables
    assert "PREVIOUS MODULE OUTPUT:" in section_b
    assert "{module_a_output}" in section_b
    assert "PARENT VARIABLES:" not in section_b
    assert "pipeline_var" not in section_b
    assert "System instructions" not in section_b


# ---------------------------------------------------------------------------
# 4. First Module Has No Previous Output Even If Selected
# ---------------------------------------------------------------------------

def test_first_module_does_not_inject_fake_previous_output(client, auth_headers):
    """If a module is the first in pipeline and selects previous_module_output,
    no fake or empty previous module output section should be generated.
    """
    sys_res = client.post(
        "/prompt-systems",
        json={"name": "Single Mod System"},
        headers=auth_headers,
    )
    sys_id = sys_res.json()["id"]

    mod_res = client.post(
        "/modules",
        json={
            "name": "First Mod",
            "instructions": "First step.",
            "input_context": ["previous_module_output"],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]

    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id, "enabled": True}, headers=auth_headers)

    compose_res = client.post(f"/prompt-systems/{sys_id}/compose", headers=auth_headers)
    assert compose_res.status_code == 200
    prompt = compose_res.json()["prompt"]

    assert "PREVIOUS MODULE OUTPUT:" not in prompt


# ---------------------------------------------------------------------------
# 5. Real Project Scenario: BDE Follow-Up Use Case (Section 15)
# ---------------------------------------------------------------------------

def test_bde_followup_scenario_preview_and_run(client, auth_headers):
    """Section 15: BDE Follow-Up real project scenario.

    Prompt System variables:
      prospect_name = Rahul
      job_title = CTO
      company_name = ABC Technologies
      industry = IT
      service = Custom Software Development
      pain_point = Backend Scalability
      sender_name = Yogesh
      sender_company = Spundan

    Module:
      First Follow-Up
      Module Context:
        [x] Parent Variables
        [ ] Parent Instructions
        [ ] Previous Module Output
        [ ] User Input

    Module should have access to prospect/company variables.
    Module must NOT receive Parent Instructions, Previous Module Output, or User Input.
    """
    # 1. Create System
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": "BDE Outreach System",
            "instructions": "You are a professional BDE responsible for LinkedIn outreach campaigns.",
            "variables": [
                {"name": "prospect_name", "type": "text"},
                {"name": "job_title", "type": "text"},
                {"name": "company_name", "type": "text"},
                {"name": "industry", "type": "text"},
                {"name": "service", "type": "text"},
                {"name": "pain_point", "type": "text"},
                {"name": "sender_name", "type": "text"},
                {"name": "sender_company", "type": "text"},
            ],
        },
        headers=auth_headers,
    )
    assert sys_res.status_code == 201
    sys_id = sys_res.json()["id"]

    # 2. Create Module
    mod_res = client.post(
        "/modules",
        json={
            "name": "First Follow-Up",
            "instructions": "Draft a personalized follow-up referencing their company and pain point.",
            "input_context": ["parent_variables"],
        },
        headers=auth_headers,
    )
    assert mod_res.status_code == 201
    mod_id = mod_res.json()["id"]

    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id, "enabled": True}, headers=auth_headers)

    # 3. Test Preview
    preview_res = client.post(f"/prompt-systems/{sys_id}/preview", headers=auth_headers)
    assert preview_res.status_code == 200
    preview_prompt = preview_res.json()["raw_prompt"]

    assert "MODULE: First Follow-Up" in preview_prompt
    assert "Draft a personalized follow-up referencing their company and pain point." in preview_prompt
    assert "PARENT VARIABLES:" in preview_prompt
    assert "prospect_name: {prospect_name}" in preview_prompt
    assert "company_name: {company_name}" in preview_prompt
    assert "pain_point: {pain_point}" in preview_prompt

    # Strictly NOT present
    assert "PARENT INSTRUCTIONS:" not in preview_prompt
    assert "professional BDE responsible for LinkedIn outreach" not in preview_prompt
    assert "PREVIOUS MODULE OUTPUT:" not in preview_prompt
    assert "USER INPUT:" not in preview_prompt

    # 4. Test Run
    runtime_vars = {
        "prospect_name": "Rahul",
        "job_title": "CTO",
        "company_name": "ABC Technologies",
        "industry": "IT",
        "service": "Custom Software Development",
        "pain_point": "Backend Scalability",
        "sender_name": "Yogesh",
        "sender_company": "Spundan",
    }
    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={"variables": runtime_vars},
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    resolved = run_res.json()["resolved_prompt"]

    # Module has access to prospect/company info resolved
    assert "prospect_name: Rahul" in resolved
    assert "job_title: CTO" in resolved
    assert "company_name: ABC Technologies" in resolved
    assert "pain_point: Backend Scalability" in resolved

    # Context boundaries preserved at runtime
    assert "professional BDE responsible for LinkedIn outreach" not in resolved
    assert "PREVIOUS MODULE OUTPUT:" not in resolved
    assert "USER INPUT:" not in resolved
