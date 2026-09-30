"""Tests for Branch 17: Prompt Run (pf-17/feature-backend/prompt-run).

Covers all 16 required test cases:
1. Run Prompt System with valid variables
2. Resolve text variable
3. Resolve multiple variables
4. Resolve number variable
5. Resolve select variable
6. Resolve multiline variable
7. Default value handling
8. Required variable validation
9. Missing required variable
10. Invalid variable value
11. Prompt System ownership
12. Unauthorized access
13. Composer is used
14. Runtime values do not modify Prompt System
15. Unconfigured placeholders remain unchanged
16. Resolved prompt is returned correctly
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
        name="Alice Runner",
        email="alice@promptforge.io",
        password_hash="$2b$12$e80M50Q5cKq6e/3cW4U.Ce6xP7rIq3pTqYkQz2k0j1e5c4g3i2a1.",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user2(db_session):
    u = User(
        name="Bob Intruder",
        email="bob@promptforge.io",
        password_hash="$2b$12$e80M50Q5cKq6e/3cW4U.Ce6xP7rIq3pTqYkQz2k0j1e5c4g3i2a1.",
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
async def prompt_system_multi(db_session, user1):
    """PromptSystem with text, number, select, multiline, and default variables."""
    ps = PromptSystem(
        name="Technical Article Generator",
        description="Generates technical articles with variable inputs",
        owner_id=user1.id,
        instructions="Write a {tone} article about {topic} for {audience}. Target length: {length} words. Requirements:\n{requirements}",
        variables=[
            {"name": "topic", "label": "Topic", "type": "text", "required": True},
            {"name": "audience", "label": "Target Audience", "type": "text", "required": True},
            {
                "name": "tone",
                "label": "Article Tone",
                "type": "select",
                "required": True,
                "default": "Technical",
                "options": ["Technical", "Casual", "Academic"],
            },
            {"name": "length", "label": "Word Length", "type": "number", "required": False, "default": 1500},
            {"name": "requirements", "label": "Requirements", "type": "multiline", "required": False},
        ],
        output_format="Return in Markdown format.",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_1_run_prompt_system_with_valid_variables(client, auth_headers1, prompt_system_multi):
    """1. Run Prompt System with valid variables returns 200 and resolved prompt."""
    payload = {
        "variables": {
            "topic": "Kubernetes networking",
            "audience": "Software engineers",
            "tone": "Technical",
            "length": 1500,
            "requirements": "Focus on CNI and kube-proxy.",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["prompt_system_id"] == prompt_system_multi.id
    assert "resolved_prompt" in data
    assert "Kubernetes networking" in data["resolved_prompt"]
    assert "Software engineers" in data["resolved_prompt"]
    assert "Technical" in data["resolved_prompt"]


def test_2_resolve_text_variable(client, auth_headers1, prompt_system_multi):
    """2. Resolve text variable in the prompt."""
    payload = {
        "variables": {
            "topic": "Rust memory safety",
            "audience": "Systems developers",
            "tone": "Technical",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    data = response.json()
    assert "Rust memory safety" in data["resolved_prompt"]
    assert "{topic}" not in data["resolved_prompt"]


def test_3_resolve_multiple_variables(client, auth_headers1, prompt_system_multi):
    """3. Resolve multiple variables simultaneously."""
    payload = {
        "variables": {
            "topic": "PostgreSQL indexing",
            "audience": "Database administrators",
            "tone": "Academic",
            "length": 2500,
            "requirements": "Cover B-tree and BRIN indexes.",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    assert "PostgreSQL indexing" in resolved
    assert "Database administrators" in resolved
    assert "Academic" in resolved
    assert "2500" in resolved
    assert "Cover B-tree and BRIN indexes." in resolved


def test_4_resolve_number_variable(client, auth_headers1, prompt_system_multi):
    """4. Resolve number variable correctly."""
    payload = {
        "variables": {
            "topic": "Docker internals",
            "audience": "DevOps",
            "tone": "Technical",
            "length": 3000,
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    assert "Target length: 3000 words" in resolved


def test_5_resolve_select_variable(client, auth_headers1, prompt_system_multi):
    """5. Resolve select variable when given an allowed choice."""
    payload = {
        "variables": {
            "topic": "WebSockets",
            "audience": "Frontend engineers",
            "tone": "Casual",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    assert "Write a Casual article" in resolved


def test_6_resolve_multiline_variable(client, auth_headers1, prompt_system_multi):
    """6. Resolve multiline variable with newlines."""
    multiline_text = "Point 1: Explain event loops\nPoint 2: Show async/await\nPoint 3: Performance profiling"
    payload = {
        "variables": {
            "topic": "Node.js Concurrency",
            "audience": "Backend developers",
            "tone": "Technical",
            "requirements": multiline_text,
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    assert multiline_text in resolved


def test_7_default_value_handling(client, auth_headers1, prompt_system_multi):
    """7. Default value handling when variable is omitted from request."""
    # Omit 'tone' (default: "Technical") and 'length' (default: 1500)
    payload = {
        "variables": {
            "topic": "Distributed tracing",
            "audience": "Site reliability engineers",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["variables"]["tone"] == "Technical"
    assert data["variables"]["length"] == 1500
    assert "Write a Technical article" in data["resolved_prompt"]
    assert "Target length: 1500 words" in data["resolved_prompt"]


def test_8_required_variable_validation(client, auth_headers1, prompt_system_multi):
    """8. Required variable validation succeeds when all required values are present."""
    payload = {
        "variables": {
            "topic": "gRPC vs REST",
            "audience": "API designers",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200


def test_9_missing_required_variable(client, auth_headers1, prompt_system_multi):
    """9. Missing required variable returns 400 with helpful error message."""
    # Missing 'topic' which has no default and is required
    payload = {
        "variables": {
            "audience": "API designers",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "topic" in detail
    assert "required" in detail or "missing" in detail


def test_10_invalid_variable_value(client, auth_headers1, prompt_system_multi):
    """10. Invalid variable value (e.g. string for number or invalid select choice) returns 400."""
    # 1. Invalid number
    bad_number_payload = {
        "variables": {
            "topic": "Microservices",
            "audience": "Developers",
            "length": "not-a-number",
        }
    }
    res_num = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=bad_number_payload,
        headers=auth_headers1,
    )
    assert res_num.status_code == 400
    assert "number" in res_num.json()["detail"].lower()

    # 2. Invalid select option
    bad_select_payload = {
        "variables": {
            "topic": "Microservices",
            "audience": "Developers",
            "tone": "Silly",  # Not in ["Technical", "Casual", "Academic"]
        }
    }
    res_sel = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=bad_select_payload,
        headers=auth_headers1,
    )
    assert res_sel.status_code == 400
    assert "tone" in res_sel.json()["detail"].lower()


def test_11_prompt_system_ownership(client, auth_headers1, auth_headers2, prompt_system_multi):
    """11. Prompt System ownership is enforced: owner succeeds, another user receives 403."""
    payload = {
        "variables": {
            "topic": "Cloud computing",
            "audience": "Engineers",
        }
    }
    # Owner passes
    res_owner = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert res_owner.status_code == 200

    # Non-owner receives 403 Forbidden
    res_other = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers2,
    )
    assert res_other.status_code == 403
    assert "permission" in res_other.json()["detail"].lower()


def test_12_unauthorized_access(client, prompt_system_multi):
    """12. Unauthorized access without valid JWT token returns 401."""
    payload = {"variables": {"topic": "Security"}}
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
    )
    assert response.status_code == 401


async def test_13_composer_is_used(db_session, client, auth_headers1, user1):
    """13. Existing Composer is used as single source of truth, assembling modules, instructions, and output format."""
    # Create module
    module = PromptModule(
        name="Research Module",
        description="Module providing deep research",
        instructions="Synthesize academic research on the topic.",
        input_context=["parent_instructions"],
        owner_id=user1.id,
    )
    db_session.add(module)
    await db_session.commit()
    await db_session.refresh(module)

    # Create prompt system with attached module
    ps = PromptSystem(
        name="Composer Test System",
        instructions="Core instruction for {topic}.",
        owner_id=user1.id,
        variables=[{"name": "topic", "type": "text", "required": True}],
        output_format="JSON object schema.",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    ref = ModuleReference(
        prompt_system_id=ps.id,
        module_id=module.id,
        enabled=True,
    )
    db_session.add(ref)
    await db_session.commit()

    response = client.post(
        f"/prompt-systems/{ps.id}/run",
        json={"variables": {"topic": "Quantum Computing"}},
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    # Check that Composer structured sections are present
    assert "PARENT INSTRUCTIONS" in resolved
    assert "Core instruction for Quantum Computing." in resolved
    assert "MODULE: Research Module" in resolved
    assert "Synthesize academic research on the topic." in resolved
    assert "OUTPUT REQUIREMENTS" in resolved
    assert "JSON object schema." in resolved


async def test_14_runtime_values_do_not_modify_prompt_system(db_session, client, auth_headers1, prompt_system_multi):
    """14. Runtime values are temporary and must NOT mutate the saved Prompt System in DB."""
    payload = {
        "variables": {
            "topic": "Database Replication",
            "audience": "Architects",
            "tone": "Casual",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200

    # Query prompt system directly from DB to verify it still contains template placeholders
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system_multi.id)
    result = await db_session.execute(stmt)
    db_ps = result.scalar_one()

    assert "{topic}" in db_ps.instructions
    assert "{audience}" in db_ps.instructions
    assert "{tone}" in db_ps.instructions
    assert "Database Replication" not in db_ps.instructions


async def test_15_unconfigured_placeholders_remain_unchanged(db_session, client, auth_headers1, user1):
    """15. Placeholders not in runtime variable configuration (e.g. module placeholders {research_output}) remain intact."""
    ps = PromptSystem(
        name="Module Placeholder Test",
        instructions="Topic: {topic}\n\nResearch:\n{research_output}\n\nCritic:\n{critic_output}",
        owner_id=user1.id,
        variables=[{"name": "topic", "type": "text", "required": True}],
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    # User passes 'topic' and also passes 'research_output' in request to test boundary
    response = client.post(
        f"/prompt-systems/{ps.id}/run",
        json={
            "variables": {
                "topic": "Kubernetes",
                "research_output": "Should NOT be substituted!",
            }
        },
        headers=auth_headers1,
    )
    assert response.status_code == 200
    resolved = response.json()["resolved_prompt"]
    assert "Topic: Kubernetes" in resolved
    assert "{research_output}" in resolved
    assert "{critic_output}" in resolved
    assert "Should NOT be substituted!" not in resolved


def test_16_resolved_prompt_is_returned_correctly(client, auth_headers1, prompt_system_multi):
    """16. Resolved prompt is returned completely and accurately in the response."""
    payload = {
        "variables": {
            "topic": "Kubernetes networking",
            "audience": "Software engineers",
            "tone": "Technical",
            "length": 1500,
            "requirements": "Focus on ingress controllers.",
        }
    }
    response = client.post(
        f"/prompt-systems/{prompt_system_multi.id}/run",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["prompt_system_id"] == prompt_system_multi.id
    assert data["variables"]["topic"] == "Kubernetes networking"
    assert data["variables"]["audience"] == "Software engineers"
    assert data["variables"]["tone"] == "Technical"
    assert data["variables"]["length"] == 1500
    assert "Write a Technical article about Kubernetes networking for Software engineers." in data["resolved_prompt"]
    assert "Target length: 1500 words." in data["resolved_prompt"]
    assert "Focus on ingress controllers." in data["resolved_prompt"]
