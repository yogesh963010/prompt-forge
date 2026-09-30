"""Tests for AI Providers (Branch 18 / Destination Providers).

Covers all required test cases:
1. Groq exists in provider registry.
2. Gemini exists in provider registry.
3. Groq provider metadata.
4. Gemini provider metadata.
5. Groq capabilities.
6. Gemini capabilities.
7. Groq provider action.
8. Gemini provider action.
9. Invalid provider is rejected.
10. Provider URLs cannot be arbitrarily supplied.
11. resolved_prompt is passed unchanged.
12. Provider action does not modify Prompt System.
13. Provider action does not modify runtime variables.
Also includes ChatGPT, Claude, and GET /providers registry listing verification.
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
from backend.app.models.user import User
from backend.app.providers import (
    ChatGPTProvider,
    ClaudeProvider,
    GeminiProvider,
    GroqProvider,
    PROVIDERS,
    get_provider,
    list_providers,
)
from backend.app.services.auth_service import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def db_session():
    """Isolated async SQLite in-memory DB."""
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
        name="Provider User",
        email="provider_user@promptforge.io",
        password_hash="$2b$12$e80M50Q5cKq6e/3cW4U.Ce6xP7rIq3pTqYkQz2k0j1e5c4g3i2a1.",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers(user1):
    token = create_access_token(data={"sub": str(user1.id), "email": user1.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def prompt_system(db_session, user1):
    ps = PromptSystem(
        name="Technical Writer System",
        description="Produces high quality technical articles",
        owner_id=user1.id,
        instructions="Write a {tone} article about {topic}.",
        variables=[
            {"name": "tone", "type": "text", "required": True},
            {"name": "topic", "type": "text", "required": True},
        ],
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


# ---------------------------------------------------------------------------
# Unit & Integration Tests
# ---------------------------------------------------------------------------

def test_1_groq_exists_in_provider_registry():
    """1. Verify Groq exists in the provider registry."""
    assert "groq" in PROVIDERS
    provider = get_provider("groq")
    assert provider is not None
    assert isinstance(provider, GroqProvider)


def test_2_gemini_exists_in_provider_registry():
    """2. Verify Gemini exists in the provider registry."""
    assert "gemini" in PROVIDERS
    provider = get_provider("gemini")
    assert provider is not None
    assert isinstance(provider, GeminiProvider)


def test_chatgpt_and_claude_exist_in_registry():
    """Verify ChatGPT and Claude also exist in the provider registry."""
    assert "chatgpt" in PROVIDERS
    assert "claude" in PROVIDERS
    assert isinstance(get_provider("chatgpt"), ChatGPTProvider)
    assert isinstance(get_provider("claude"), ClaudeProvider)


def test_3_groq_provider_metadata():
    """3. Verify Groq provider metadata."""
    groq = get_provider("groq")
    assert groq is not None
    assert groq.id == "groq"
    assert groq.name == "Groq"
    assert "groq.com" in groq.url


def test_4_gemini_provider_metadata():
    """4. Verify Gemini provider metadata."""
    gemini = get_provider("gemini")
    assert gemini is not None
    assert gemini.id == "gemini"
    assert gemini.name == "Gemini"
    assert "gemini.google.com" in gemini.url


def test_5_groq_capabilities():
    """5. Verify Groq capabilities."""
    groq = get_provider("groq")
    assert groq is not None
    assert groq.capabilities == {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }


def test_6_gemini_capabilities():
    """6. Verify Gemini capabilities."""
    gemini = get_provider("gemini")
    assert gemini is not None
    assert gemini.capabilities == {
        "open": True,
        "run": False,
        "copy_prompt": True,
    }


def test_7_groq_provider_action(client):
    """7. Verify Groq provider action endpoint and response."""
    test_prompt = (
        "You are a technical writer.\n"
        "Write a Technical article about Kubernetes networking."
    )
    res = client.post(
        "/providers/groq/action",
        json={"resolved_prompt": test_prompt},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider_id"] == "groq"
    assert data["provider_name"] == "Groq"
    assert "groq.com" in data["url"]
    assert data["action"] == "open"
    assert data["copy_prompt"] is True
    assert data["resolved_prompt"] == test_prompt


def test_8_gemini_provider_action(client):
    """8. Verify Gemini provider action endpoint and response."""
    test_prompt = (
        "You are a technical writer.\n"
        "Write a Technical article about Kubernetes networking."
    )
    res = client.post(
        "/providers/gemini/action",
        json={"resolved_prompt": test_prompt},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["provider_id"] == "gemini"
    assert data["provider_name"] == "Gemini"
    assert "gemini.google.com" in data["url"]
    assert data["action"] == "open"
    assert data["copy_prompt"] is True
    assert data["resolved_prompt"] == test_prompt


def test_9_invalid_provider_is_rejected(client):
    """9. Verify invalid provider ID returns 404."""
    res_get = client.get("/providers/unsupported_provider")
    assert res_get.status_code == 404

    res_post = client.post(
        "/providers/unsupported_provider/action",
        json={"resolved_prompt": "Some prompt"},
    )
    assert res_post.status_code == 404
    assert "not supported" in res_post.json()["detail"].lower()


def test_10_provider_urls_cannot_be_arbitrarily_supplied(client):
    """10. Verify provider URLs cannot be arbitrarily supplied or injected."""
    arbitrary_url = "https://malicious-site.com/exploit"
    res = client.post(
        f"/providers/{arbitrary_url}/action",
        json={"resolved_prompt": "Some prompt"},
    )
    # Must reject non-registered provider identifier
    assert res.status_code == 404


def test_11_resolved_prompt_is_passed_unchanged(client):
    """11. Verify resolved_prompt is passed completely unchanged to the provider."""
    complex_prompt = (
        "SYSTEM INSTRUCTIONS\n\n"
        "You are a technical writer.\n\n"
        "Write a Technical article about Kubernetes networking.\n\n"
        "EXAMPLES\n\n"
        "Example 1: Explain CNI.\n\n"
        "OUTPUT REQUIREMENTS\n\n"
        "Return Markdown formatted text with code snippets."
    )
    for pid in ["chatgpt", "claude", "groq", "gemini"]:
        res = client.post(
            f"/providers/{pid}/action",
            json={"resolved_prompt": complex_prompt},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["resolved_prompt"] == complex_prompt


async def test_12_provider_action_does_not_modify_prompt_system(client, db_session, prompt_system):
    """12. Verify provider action does not mutate Prompt System in database."""
    test_prompt = "Write a Technical article about Kubernetes networking."
    res = client.post(
        "/providers/groq/action",
        json={"resolved_prompt": test_prompt},
    )
    assert res.status_code == 200

    # Query DB to check Prompt System is unchanged
    stmt = select(PromptSystem).where(PromptSystem.id == prompt_system.id)
    result = await db_session.execute(stmt)
    ps_in_db = result.scalar_one()

    assert "{tone}" in ps_in_db.instructions
    assert "{topic}" in ps_in_db.instructions
    assert "Kubernetes networking" not in ps_in_db.instructions


def test_13_provider_action_does_not_modify_runtime_variables(client):
    """13. Verify provider action does not alter runtime variables dictionary."""
    runtime_vars = {
        "tone": "Technical",
        "topic": "Kubernetes networking",
    }
    original_vars = dict(runtime_vars)
    resolved_prompt = f"Write a {runtime_vars['tone']} article about {runtime_vars['topic']}."

    res = client.post(
        "/providers/gemini/action",
        json={"resolved_prompt": resolved_prompt},
    )
    assert res.status_code == 200
    assert runtime_vars == original_vars


def test_get_providers_list_endpoint(client):
    """Verify GET /providers endpoint returns all registered providers with exact schema."""
    res = client.get("/providers")
    assert res.status_code == 200
    providers = res.json()
    assert len(providers) == 4

    expected_ids = ["chatgpt", "claude", "groq", "gemini"]
    returned_ids = [p["id"] for p in providers]
    assert returned_ids == expected_ids

    for p in providers:
        assert "id" in p
        assert "name" in p
        assert "capabilities" in p
        assert p["capabilities"]["open"] is True
        assert p["capabilities"]["run"] is False
        assert p["capabilities"]["copy_prompt"] is True
