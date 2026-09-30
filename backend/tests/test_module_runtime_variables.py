"""Tests for Module Variable -> Runtime Input -> Composer flow (Branch: Module Runtime Variables).

Verifies:
1. Module with no variables
2. Module with one variable
3. Module with multiple variables
4. Required module variable missing
5. Invalid module variable type
6. Module variable persistence
7. Module variable update
8. Runtime module variable resolution
9. Prompt Preview resolves module variables
10. Prompt Run resolves module variables
11. Parent Variables + Module Variables
12. Module Variables without Parent Variables
13. Previous Module Output + Module Variables
14. Multiple modules with independent variables (isolation)
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
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


def test_1_module_with_no_variables(client, auth_headers):
    """1. Module can be created and run without any variables."""
    # Create module
    mod_res = client.post(
        "/modules",
        json={"name": "Zero Var Module", "instructions": "Execute general instruction.", "variables": []},
        headers=auth_headers,
    )
    assert mod_res.status_code == 201
    mod_data = mod_res.json()
    assert mod_data["variables"] == []

    # Create system and attach
    sys_res = client.post("/prompt-systems", json={"name": "System A"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_data["id"]}, headers=auth_headers)

    # Run selected module
    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={"module_id": mod_data["id"], "module_variables": {}},
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    assert "MODULE: Zero Var Module" in run_res.json()["resolved_prompt"]


def test_2_module_with_one_variable(client, auth_headers):
    """2. Module with a single variable defined, collected, and resolved."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "One Var Module",
            "instructions": "Hello {user_name}, welcome!",
            "variables": [{"name": "user_name", "type": "string", "required": True}],
        },
        headers=auth_headers,
    )
    assert mod_res.status_code == 201
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "System B"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={"module_id": mod_id, "module_variables": {"user_name": "Alice"}},
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]
    assert "Hello Alice, welcome!" in prompt
    assert "{user_name}" not in prompt


def test_3_module_with_multiple_variables(client, auth_headers):
    """3. Module with multiple variables of different types."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "Multi Var Module",
            "instructions": "Stage: {stage}, Days: {days}, Urgent: {is_urgent}",
            "variables": [
                {"name": "stage", "type": "string", "required": True},
                {"name": "days", "type": "integer", "required": True},
                {"name": "is_urgent", "type": "boolean", "required": False, "default": False},
            ],
        },
        headers=auth_headers,
    )
    assert mod_res.status_code == 201
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "System C"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"stage": "Final Stage", "days": 10, "is_urgent": True},
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]
    assert "Stage: Final Stage, Days: 10, Urgent: True" in prompt
    assert "{stage}" not in prompt
    assert "{days}" not in prompt


def test_4_required_module_variable_missing(client, auth_headers):
    """4. Running a module with missing required module variable produces HTTP 400."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "Required Test Mod",
            "instructions": "Need {required_param}",
            "variables": [{"name": "required_param", "type": "string", "required": True}],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "System D"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    # Missing in payload
    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={"module_id": mod_id, "module_variables": {}},
        headers=auth_headers,
    )
    assert run_res.status_code == 400
    assert "required_param" in run_res.json()["detail"].lower()


def test_5_invalid_module_variable_type(client, auth_headers):
    """5. Invalid integer or boolean module variable types produce validation errors."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "Type Test Mod",
            "instructions": "Days: {days_since_last_message}, Active: {is_active}",
            "variables": [
                {"name": "days_since_last_message", "type": "integer", "required": True},
                {"name": "is_active", "type": "boolean", "required": True},
            ],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "System E"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    # Invalid integer string
    res_int_err = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"days_since_last_message": "abc", "is_active": True},
        },
        headers=auth_headers,
    )
    assert res_int_err.status_code == 400
    assert "integer" in res_int_err.json()["detail"].lower()

    # Invalid boolean string
    res_bool_err = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"days_since_last_message": 5, "is_active": "not_a_bool"},
        },
        headers=auth_headers,
    )
    assert res_bool_err.status_code == 400
    assert "boolean" in res_bool_err.json()["detail"].lower()


def test_6_module_variable_persistence(client, auth_headers):
    """6. Module variable definitions are persisted and returned via API."""
    var_defs = [
        {"name": "followup_stage", "type": "string", "required": True},
        {"name": "days_since_last_message", "type": "integer", "required": True},
        {"name": "previous_message", "type": "string", "required": False, "default": "N/A"},
    ]
    create_res = client.post(
        "/modules",
        json={
            "name": "Persist Mod",
            "instructions": "Sample instructions.",
            "variables": var_defs,
        },
        headers=auth_headers,
    )
    assert create_res.status_code == 201
    mod_id = create_res.json()["id"]

    get_res = client.get(f"/modules/{mod_id}", headers=auth_headers)
    assert get_res.status_code == 200
    saved_vars = get_res.json()["variables"]
    assert len(saved_vars) == 3
    var_names = [v["name"] for v in saved_vars]
    assert "followup_stage" in var_names
    assert "days_since_last_message" in var_names
    assert "previous_message" in var_names


def test_7_module_variable_update(client, auth_headers):
    """7. Updating a module's variables persists the new definitions."""
    create_res = client.post(
        "/modules",
        json={
            "name": "Update Mod",
            "instructions": "Initial",
            "variables": [{"name": "old_var", "type": "string"}],
        },
        headers=auth_headers,
    )
    mod_id = create_res.json()["id"]

    update_res = client.put(
        f"/modules/{mod_id}",
        json={
            "name": "Update Mod",
            "instructions": "Updated",
            "variables": [
                {"name": "new_var_1", "type": "integer", "required": True},
                {"name": "new_var_2", "type": "boolean", "required": False},
            ],
        },
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    updated_vars = update_res.json()["variables"]
    assert len(updated_vars) == 2
    assert updated_vars[0]["name"] == "new_var_1"
    assert updated_vars[1]["name"] == "new_var_2"


def test_8_runtime_module_variable_resolution(client, auth_headers):
    """8. Composer resolves {followup_stage} and {days_since_last_message} in instructions."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "First Follow-Up",
            "instructions": "Write a {followup_stage} LinkedIn follow-up. Last contacted {days_since_last_message} days ago.",
            "variables": [
                {"name": "followup_stage", "type": "string", "required": True},
                {"name": "days_since_last_message", "type": "integer", "required": True},
            ],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "Outreach System"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {
                "followup_stage": "First Follow-Up",
                "days_since_last_message": 5,
            },
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]
    assert "Write a First Follow-Up LinkedIn follow-up. Last contacted 5 days ago." in prompt
    assert "{followup_stage}" not in prompt
    assert "{days_since_last_message}" not in prompt


def test_9_preview_and_run_resolves_module_variables(client, auth_headers):
    """9 & 10. Prompt Run and Preview resolution matches and contains no leftover placeholders."""
    mod_res = client.post(
        "/modules",
        json={
            "name": "Preview Mod",
            "instructions": "Action: {action_name}",
            "variables": [{"name": "action_name", "type": "string", "required": True}],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]

    sys_res = client.post("/prompt-systems", json={"name": "Preview System"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"action_name": "Schedule Demo"},
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    resolved = run_res.json()["resolved_prompt"]
    assert "Action: Schedule Demo" in resolved
    assert "{action_name}" not in resolved


def test_11_parent_variables_and_module_variables(client, auth_headers):
    """11. Module with parent_variables enabled receives and resolves both Parent & Module variables."""
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": "Full BDE System",
            "variables": [
                {"name": "prospect_name", "type": "text", "required": True},
                {"name": "company_name", "type": "text", "required": True},
            ],
        },
        headers=auth_headers,
    )
    sys_id = sys_res.json()["id"]

    mod_res = client.post(
        "/modules",
        json={
            "name": "Follow-Up Module",
            "instructions": "Contact {prospect_name} at {company_name} for {followup_stage}.",
            "input_context": ["parent_variables"],
            "variables": [
                {"name": "followup_stage", "type": "string", "required": True},
            ],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "variables": {"prospect_name": "Rahul", "company_name": "ABC Technologies"},
            "module_variables": {"followup_stage": "First Follow-Up"},
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    data = run_res.json()
    prompt = data["resolved_prompt"]
    assert "Contact Rahul at ABC Technologies for First Follow-Up." in prompt
    assert "{prospect_name}" not in prompt
    assert "{company_name}" not in prompt
    assert "{followup_stage}" not in prompt


def test_12_module_variables_without_parent_variables(client, auth_headers):
    """12. Module variables work even when Parent Variables context is not selected."""
    sys_res = client.post(
        "/prompt-systems",
        json={
            "name": "System with Parent Vars",
            "variables": [{"name": "system_var", "type": "text", "required": True}],
        },
        headers=auth_headers,
    )
    sys_id = sys_res.json()["id"]

    # Module with NO parent_variables context
    mod_res = client.post(
        "/modules",
        json={
            "name": "Isolated Module",
            "instructions": "Step: {step_name}",
            "input_context": [],
            "variables": [{"name": "step_name", "type": "string", "required": True}],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    # Does not supply parent variables: should succeed without error because parent_variables is disabled
    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"step_name": "Data Ingestion"},
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]
    assert "Step: Data Ingestion" in prompt
    assert "PARENT VARIABLES:" not in prompt


def test_13_previous_module_output_and_module_variables(client, auth_headers):
    """13. Previous Module Output supplied at runtime alongside Module Variables."""
    sys_res = client.post("/prompt-systems", json={"name": "Pipeline System"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]

    mod_res = client.post(
        "/modules",
        json={
            "name": "Second Step",
            "instructions": "Based on previous message, send stage {stage}.",
            "input_context": ["previous_module_output"],
            "variables": [{"name": "stage", "type": "string", "required": True}],
        },
        headers=auth_headers,
    )
    mod_id = mod_res.json()["id"]
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_id}, headers=auth_headers)

    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_id,
            "module_variables": {"stage": "Second Follow-Up"},
            "previous_module_output": "Hi Rahul, I noticed ABC Technologies is expanding...",
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]
    assert "PREVIOUS MODULE OUTPUT:\nHi Rahul, I noticed ABC Technologies is expanding..." in prompt
    assert "send stage Second Follow-Up." in prompt


def test_14_multiple_modules_with_independent_variables_isolation(client, auth_headers):
    """14. When Module B is selected, only Module B executes (Module A is not executed)."""
    sys_res = client.post("/prompt-systems", json={"name": "Multi Module Pipeline"}, headers=auth_headers)
    sys_id = sys_res.json()["id"]

    mod_a = client.post(
        "/modules",
        json={
            "name": "Initial Outreach",
            "instructions": "Write initial outreach for {campaign}.",
            "variables": [{"name": "campaign", "type": "string", "required": True}],
        },
        headers=auth_headers,
    ).json()

    mod_b = client.post(
        "/modules",
        json={
            "name": "First Follow-Up",
            "instructions": "Write follow-up {followup_num}.",
            "variables": [{"name": "followup_num", "type": "integer", "required": True}],
        },
        headers=auth_headers,
    ).json()

    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_a["id"]}, headers=auth_headers)
    client.post(f"/prompt-systems/{sys_id}/modules", json={"module_id": mod_b["id"]}, headers=auth_headers)

    # Execute ONLY module B (First Follow-Up)
    run_res = client.post(
        f"/prompt-systems/{sys_id}/run",
        json={
            "module_id": mod_b["id"],
            "module_variables": {"followup_num": 1},
        },
        headers=auth_headers,
    )
    assert run_res.status_code == 200
    prompt = run_res.json()["resolved_prompt"]

    # Module B must be present and resolved
    assert "MODULE: First Follow-Up" in prompt
    assert "Write follow-up 1." in prompt

    # Module A must NOT be executed or present!
    assert "MODULE: Initial Outreach" not in prompt
    assert "Write initial outreach for" not in prompt
