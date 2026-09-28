"""Tests for Branch 15: Prompt Testing (pf-15/feature-backend/prompt-testing).

Covers:
1. Create test case
2. Get test case
3. List test cases
4. Update test case
5. Delete test case
6. Run test case
7. Required variable validation
8. Missing variable validation
9. Prompt variable resolution
10. Unauthorized Prompt System access
11. Unauthorized Test Case access
12. Test Case belonging to another Prompt System
13. Re-running a test case after prompt changes
14. Saved test case remains unchanged after running
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
from backend.app.models.test_case import TestCase
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
    """PromptSystem owned by user1 with variables and instructions."""
    ps = PromptSystem(
        name="Article Generator",
        description="Generates technical articles",
        owner_id=user1.id,
        instructions="Write a {topic} article for {audience} with a {tone} tone.",
        variables=[
            {"name": "topic", "type": "text", "required": True},
            {"name": "audience", "type": "text", "required": True},
            {"name": "tone", "type": "text", "required": True},
        ],
        output_format="Return markdown text.",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def prompt_system2(db_session, user2):
    """PromptSystem owned by user2."""
    ps = PromptSystem(
        name="User2 System",
        description="System owned by user 2",
        owner_id=user2.id,
        instructions="Summarize {text}.",
        variables=[{"name": "text", "required": True}],
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


# ---------------------------------------------------------------------------
# Test Cases
# ---------------------------------------------------------------------------

def test_1_create_test_case(client, auth_headers1, prompt_system1):
    """1. Create a test case and verify response."""
    payload = {
        "name": "Kubernetes Article",
        "variables": {
            "topic": "Kubernetes networking",
            "audience": "Software engineers",
            "tone": "Technical",
        },
        "expected_behavior": [
            "Explain concepts clearly",
            "Include examples",
            "Avoid unsupported claims",
        ],
    }
    response = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json=payload,
        headers=auth_headers1,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Kubernetes Article"
    assert data["prompt_system_id"] == prompt_system1.id
    assert data["variables"]["topic"] == "Kubernetes networking"
    assert "Explain concepts clearly" in data["expected_behavior"]
    assert "id" in data
    assert "created_at" in data


def test_2_get_test_case(client, auth_headers1, prompt_system1):
    """2. Retrieve a single test case by ID."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Single Test Fetch",
            "variables": {"topic": "Docker", "audience": "DevOps", "tone": "Direct"},
            "expected_behavior": "Clear overview",
        },
        headers=auth_headers1,
    )
    assert create_res.status_code == 201
    test_id = create_res.json()["id"]

    get_res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers1,
    )
    assert get_res.status_code == 200
    data = get_res.json()
    assert data["id"] == test_id
    assert data["name"] == "Single Test Fetch"
    assert data["variables"]["topic"] == "Docker"


def test_3_list_test_cases(client, auth_headers1, prompt_system1):
    """3. List all test cases for a Prompt System."""
    client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={"name": "Case A", "variables": {"topic": "A", "audience": "B", "tone": "C"}},
        headers=auth_headers1,
    )
    client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={"name": "Case B", "variables": {"topic": "X", "audience": "Y", "tone": "Z"}},
        headers=auth_headers1,
    )

    list_res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests",
        headers=auth_headers1,
    )
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 2
    names = [i["name"] for i in items]
    assert "Case A" in names
    assert "Case B" in names


def test_4_update_test_case(client, auth_headers1, prompt_system1):
    """4. Update test case fields (name, variables, expected_behavior)."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Initial Name",
            "variables": {"topic": "v1", "audience": "devs", "tone": "calm"},
            "expected_behavior": "Old behavior",
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        json={
            "name": "Updated Name",
            "variables": {"topic": "v2", "audience": "leads", "tone": "urgent"},
            "expected_behavior": "Updated behavior",
        },
        headers=auth_headers1,
    )
    assert patch_res.status_code == 200
    data = patch_res.json()
    assert data["name"] == "Updated Name"
    assert data["variables"]["topic"] == "v2"
    assert data["expected_behavior"] == "Updated behavior"


def test_5_delete_test_case(client, auth_headers1, prompt_system1):
    """5. Delete a test case and verify it is no longer retrievable."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "To Delete",
            "variables": {"topic": "T", "audience": "A", "tone": "N"},
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    del_res = client.delete(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers1,
    )
    assert del_res.status_code == 200

    get_res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers1,
    )
    assert get_res.status_code == 404


def test_6_run_test_case(client, auth_headers1, prompt_system1):
    """6. Run a saved test case and verify generated output & resolved prompt."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Kubernetes Article Test",
            "variables": {
                "topic": "Kubernetes networking",
                "audience": "Software engineers",
                "tone": "Technical",
            },
            "expected_behavior": "- Explain concepts clearly",
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    run_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run_res.status_code == 200
    run_data = run_res.json()
    assert run_data["test_case_id"] == test_id
    assert run_data["prompt_system_id"] == prompt_system1.id
    assert "resolved_prompt" in run_data
    assert "generated_output" in run_data
    assert "Kubernetes networking" in run_data["resolved_prompt"]
    assert "Software engineers" in run_data["resolved_prompt"]
    assert "Technical" in run_data["resolved_prompt"]


def test_7_required_variable_validation(client, auth_headers1, prompt_system1):
    """7. Valid when all required variables are supplied."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "All Required Present",
            "variables": {
                "topic": "Microservices",
                "audience": "Architects",
                "tone": "Professional",
            },
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    run_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run_res.status_code == 200


def test_8_missing_variable_validation(client, auth_headers1, prompt_system1):
    """8. Return validation error (400) when a required variable is missing."""
    # Topic is missing from variables
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Missing Topic",
            "variables": {
                "audience": "Software engineers",
                "tone": "Technical",
            },
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    run_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run_res.status_code == 400
    detail = run_res.json()["detail"].lower()
    assert "missing" in detail
    assert "topic" in detail


def test_9_prompt_variable_resolution(client, auth_headers1, prompt_system1):
    """9. Verify runtime variable replacement: {topic} and {audience} correctly replaced."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Variable Replacement Check",
            "variables": {
                "topic": "GraphQL APIs",
                "audience": "Frontend Developers",
                "tone": "Practical",
            },
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    run_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run_res.status_code == 200
    resolved = run_res.json()["resolved_prompt"]
    assert "Write a GraphQL APIs article for Frontend Developers with a Practical tone." in resolved
    # Verify no unresolved curly braces for topic or audience in instructions
    assert "{topic}" not in resolved
    assert "{audience}" not in resolved
    assert "{tone}" not in resolved


def test_10_unauthorized_prompt_system_access(client, auth_headers2, prompt_system1):
    """10. User 2 cannot create, list, or run test cases on User 1's PromptSystem -> 403."""
    # Create test case on another user's prompt system
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={"name": "Attacker Test", "variables": {}},
        headers=auth_headers2,
    )
    assert res.status_code == 403

    # List tests on another user's prompt system
    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests",
        headers=auth_headers2,
    )
    assert res.status_code == 403


def test_11_unauthorized_test_case_access(client, auth_headers1, auth_headers2, prompt_system1):
    """11. User 2 cannot get, patch, delete, or run User 1's test case -> 403."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "User 1 Secret Test",
            "variables": {"topic": "A", "audience": "B", "tone": "C"},
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    # User 2 tries to GET
    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers2,
    )
    assert res.status_code == 403

    # User 2 tries to PATCH
    res = client.patch(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        json={"name": "Tampered"},
        headers=auth_headers2,
    )
    assert res.status_code == 403

    # User 2 tries to DELETE
    res = client.delete(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers2,
    )
    assert res.status_code == 403

    # User 2 tries to RUN
    res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers2,
    )
    assert res.status_code == 403


def test_12_test_case_belonging_to_another_prompt_system(
    client, auth_headers1, prompt_system1, db_session, user1
):
    """12. Accessing a test case with the wrong prompt_system_id returns 404."""
    # Create another PromptSystem owned by the same user
    import asyncio
    async def create_another_ps():
        ps2 = PromptSystem(
            name="Another System",
            owner_id=user1.id,
            instructions="Do something",
        )
        db_session.add(ps2)
        await db_session.commit()
        await db_session.refresh(ps2)
        return ps2

    loop = asyncio.get_event_loop()
    ps2 = loop.run_until_complete(create_another_ps())

    # Create test case under ps2
    create_res = client.post(
        f"/prompt-systems/{ps2.id}/tests",
        json={"name": "PS2 Test", "variables": {}},
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    # Try to access it under prompt_system1
    res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers1,
    )
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


def test_13_re_running_a_test_case_after_prompt_changes(
    client, auth_headers1, prompt_system1
):
    """13. Re-running a test case after changing prompt instructions reflects the new prompt."""
    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Re-run Test Case",
            "variables": {
                "topic": "Kafka",
                "audience": "Devs",
                "tone": "Casual",
            },
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    # First run
    run1 = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run1.status_code == 200
    assert "Write a Kafka article for Devs with a Casual tone." in run1.json()["resolved_prompt"]

    # Update prompt system instructions
    update_res = client.patch(
        f"/prompt-systems/{prompt_system1.id}",
        json={"instructions": "Produce an in-depth {topic} guide for {audience} with {tone} style."},
        headers=auth_headers1,
    )
    assert update_res.status_code == 200

    # Re-run same test case without altering the test case
    run2 = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run2.status_code == 200
    assert "Produce an in-depth Kafka guide for Devs with Casual style." in run2.json()["resolved_prompt"]


def test_14_saved_test_case_remains_unchanged_after_running(
    client, auth_headers1, prompt_system1
):
    """14. Saved test case data in DB remains completely unchanged before and after run."""
    initial_variables = {
        "topic": "Rust concurrency",
        "audience": "Systems engineers",
        "tone": "Academic",
    }
    initial_expected = "Explains borrow checker and Arc/Mutex clearly"

    create_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests",
        json={
            "name": "Immutable Test Case",
            "variables": initial_variables,
            "expected_behavior": initial_expected,
        },
        headers=auth_headers1,
    )
    test_id = create_res.json()["id"]

    # Run the test case
    run_res = client.post(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}/run",
        headers=auth_headers1,
    )
    assert run_res.status_code == 200

    # Fetch the test case again and verify all fields are identical
    fetch_res = client.get(
        f"/prompt-systems/{prompt_system1.id}/tests/{test_id}",
        headers=auth_headers1,
    )
    assert fetch_res.status_code == 200
    saved = fetch_res.json()
    assert saved["name"] == "Immutable Test Case"
    assert saved["variables"] == initial_variables
    assert saved["expected_behavior"] == initial_expected
    assert saved["prompt_system_id"] == prompt_system1.id
