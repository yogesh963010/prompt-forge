"""test_rag_api.py
-----------------
Tests for PromptForge RAG endpoints (/ask, /chat, /status).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
from backend.app.models.user import User
from backend.app.models.prompt_system import PromptSystem
from backend.app.services.auth_service import create_access_token


@pytest.fixture
async def db_session():
    """Create in-memory SQLite database session."""
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
    """FastAPI TestClient with overridden get_db dependency."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
async def test_user(db_session) -> User:
    """Create test user."""
    user = User(
        email="rag_test@promptforge.dev",
        name="RAG Tester",
        password_hash="hashed_pw_test",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict:
    """Create authorization headers for test user."""
    token = create_access_token(data={"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_ask_requires_authentication(client):
    """Verify that /ask returns 401 when unauthenticated."""
    response = client.post("/ask", json={"question": "What is PromptForge?"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_ask_empty_question_rejected(client, auth_headers):
    """Verify that /ask rejects empty or whitespace questions with 400 or 422."""
    response = client.post("/ask", json={"question": "   "}, headers=auth_headers)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_status_endpoint(client, auth_headers):
    """Verify /status endpoint returns document presence boolean."""
    response = client.get("/status", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "has_document" in data
    assert isinstance(data["has_document"], bool)


@pytest.mark.asyncio
async def test_chat_alias_endpoint(client, auth_headers):
    """Verify /chat alias endpoint rejects empty question similarly."""
    response = client.post("/chat", json={"question": ""}, headers=auth_headers)
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_ask_direct_fallback_generation(client, auth_headers):
    """Verify that /ask succeeds even when no documents are uploaded (direct LLM fallback)."""
    response = client.post(
        "/ask",
        json={"question": "Say PromptForge rocks in 3 words"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert len(data["answer"]) > 0
    assert "sources" in data
    assert isinstance(data["sources"], list)
