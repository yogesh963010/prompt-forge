"""Tests for BYOK AI Provider Credentials and Encryption.

Covers:
1. User can add / save API key (OpenAI, Anthropic, Gemini, Groq).
2. Key is encrypted in DB (never stored in plain text).
3. GET API returns only masked key (never full key).
4. POST/PUT responses return only masked key.
5. User can update key.
6. User can delete key.
7. User isolation (User A cannot see or modify User B's keys).
8. Unsupported providers are rejected with 422.
9. Missing credentials produce clean 404 / error responses.
10. Test connection endpoint functions cleanly and masks/handles errors.
11. Export does not contain API keys.
12. Import does not create credentials.
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

# Ensure test encryption key is configured
os.environ["CREDENTIAL_ENCRYPTION_KEY"] = "1QKiyZp4OOR5bvd7Yb3DmgKtDN5VAVN_j5adYCoYW-o="

from backend.app.database.base import Base
from backend.app.database.connection import get_db
from backend.app.main import app
from backend.app.models.user import User
from backend.app.models.ai_provider_credential import AIProviderCredential
from backend.app.models.prompt_system import PromptSystem
from backend.app.services.auth_service import hash_password, create_access_token
from backend.app.utils.encryption import decrypt_api_key, mask_api_key
from backend.app.services.import_export_service import export_prompt_system, import_prompt_system


@pytest.fixture
async def db_session():
    """Isolated async SQLite in-memory DB fixture."""
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

    await engine.dispose()


@pytest.fixture
async def users(db_session: AsyncSession):
    """Create two test users for isolation testing."""
    u1 = User(
        name="User One",
        email="user1@example.com",
        password_hash=hash_password("Password123!"),
    )
    u2 = User(
        name="User Two",
        email="user2@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add_all([u1, u2])
    await db_session.commit()
    await db_session.refresh(u1)
    await db_session.refresh(u2)
    return u1, u2


@pytest.fixture
def auth_headers(users):
    u1, u2 = users
    token1 = create_access_token(data={"sub": str(u1.id), "email": u1.email})
    token2 = create_access_token(data={"sub": str(u2.id), "email": u2.email})
    return {
        "user1": {"Authorization": f"Bearer {token1}"},
        "user2": {"Authorization": f"Bearer {token2}"},
    }


@pytest.fixture
async def client(db_session: AsyncSession):
    """FastAPI async test client with dependency override."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_credentials_empty(client: AsyncClient, auth_headers):
    """Initially, all four providers return configured=False and no raw keys."""
    resp = await client.get("/ai-providers", headers=auth_headers["user1"])
    assert resp.status_code == 200
    data = resp.json()
    assert "credentials" in data
    assert len(data["credentials"]) == 4

    providers = {c["provider"]: c for c in data["credentials"]}
    for p in ["openai", "anthropic", "gemini", "groq"]:
        assert p in providers
        assert providers[p]["configured"] is False
        assert providers[p]["masked_api_key"] is None


@pytest.mark.asyncio
async def test_save_and_encrypt_credential(client: AsyncClient, auth_headers, db_session: AsyncSession, users):
    """Saving an API key stores it encrypted in DB and returns only masked representation."""
    u1, _ = users
    raw_key = "sk-test-1234567890abcdef"

    resp = await client.post(
        "/ai-providers",
        json={"provider": "openai", "api_key": raw_key},
        headers=auth_headers["user1"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "openai"
    assert data["configured"] is True
    assert data["masked_api_key"] == "••••••••cdef"
    assert "api_key" not in data  # NEVER return raw key

    # Verify database contents
    stmt = select(AIProviderCredential).where(
        AIProviderCredential.user_id == u1.id,
        AIProviderCredential.provider == "openai",
    )
    res = await db_session.execute(stmt)
    cred = res.scalar_one_or_none()
    assert cred is not None
    # Verify DB has encrypted string, NOT plain text
    assert cred.encrypted_api_key != raw_key
    assert "sk-test" not in cred.encrypted_api_key
    # Verify decryption restores original key
    assert decrypt_api_key(cred.encrypted_api_key) == raw_key


@pytest.mark.asyncio
async def test_update_credential(client: AsyncClient, auth_headers, db_session: AsyncSession, users):
    """Updating a credential replaces encrypted key and updates timestamp."""
    u1, _ = users
    # Initial save
    await client.post(
        "/ai-providers",
        json={"provider": "groq", "api_key": "gsk_first_key_1111"},
        headers=auth_headers["user1"],
    )

    # Update via PUT
    updated_key = "gsk_second_key_9999"
    resp = await client.put(
        "/ai-providers/groq",
        json={"provider": "groq", "api_key": updated_key},
        headers=auth_headers["user1"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["configured"] is True
    assert data["masked_api_key"] == "••••••••9999"

    # Verify in DB
    stmt = select(AIProviderCredential).where(
        AIProviderCredential.user_id == u1.id,
        AIProviderCredential.provider == "groq",
    )
    cred = (await db_session.execute(stmt)).scalar_one()
    assert decrypt_api_key(cred.encrypted_api_key) == updated_key


@pytest.mark.asyncio
async def test_delete_credential(client: AsyncClient, auth_headers, db_session: AsyncSession, users):
    """Deleting a credential removes it from DB."""
    u1, _ = users
    await client.post(
        "/ai-providers",
        json={"provider": "anthropic", "api_key": "sk-ant-test-key"},
        headers=auth_headers["user1"],
    )

    del_resp = await client.delete("/ai-providers/anthropic", headers=auth_headers["user1"])
    assert del_resp.status_code == 204

    # Verify deleted in DB
    stmt = select(AIProviderCredential).where(
        AIProviderCredential.user_id == u1.id,
        AIProviderCredential.provider == "anthropic",
    )
    cred = (await db_session.execute(stmt)).scalar_one_or_none()
    assert cred is None

    # Deleting again returns 404
    del_again = await client.delete("/ai-providers/anthropic", headers=auth_headers["user1"])
    assert del_again.status_code == 404


@pytest.mark.asyncio
async def test_user_isolation(client: AsyncClient, auth_headers):
    """User B cannot see or delete User A's API credentials."""
    # User A creates a key
    await client.post(
        "/ai-providers",
        json={"provider": "gemini", "api_key": "gemini-secret-key-1234"},
        headers=auth_headers["user1"],
    )

    # User B lists credentials
    resp_b = await client.get("/ai-providers", headers=auth_headers["user2"])
    b_data = resp_b.json()
    gemini_b = next(c for c in b_data["credentials"] if c["provider"] == "gemini")
    # User B should see NOT configured
    assert gemini_b["configured"] is False
    assert gemini_b["masked_api_key"] is None

    # User B cannot delete User A's key
    del_resp = await client.delete("/ai-providers/gemini", headers=auth_headers["user2"])
    assert del_resp.status_code == 404


@pytest.mark.asyncio
async def test_unsupported_provider_rejected(client: AsyncClient, auth_headers):
    """Reject invalid provider names."""
    resp = await client.post(
        "/ai-providers",
        json={"provider": "unsupported_llm", "api_key": "some-key"},
        headers=auth_headers["user1"],
    )
    assert resp.status_code in (400, 422)


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected(client: AsyncClient):
    """Requests without JWT token are rejected with 401."""
    resp = await client.get("/ai-providers")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_export_import_excludes_credentials(db_session: AsyncSession, users):
    """Export never contains API keys or credentials; Import does not create credentials."""
    u1, _ = users
    ps = PromptSystem(
        name="Assistant With Secrets",
        instructions="Helpful assistant",
        owner_id=u1.id,
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    # Export assistant
    exported = await export_prompt_system(db_session, ps)
    export_str = str(exported).lower()

    # Verify no secret fields exist in exported json
    assert "api_key" not in exported
    assert "encrypted_api_key" not in exported
    assert "credentials" not in exported
    assert "secrets" not in exported
    assert "1qkiyz" not in export_str

    # Import assistant
    imported_ps = await import_prompt_system(db_session, exported, owner_id=u1.id)
    assert imported_ps.id is not None
    assert imported_ps.name == "Assistant With Secrets (Imported)"

    # Verify no credential records created during import
    stmt = select(AIProviderCredential).where(AIProviderCredential.user_id == u1.id)
    creds = (await db_session.execute(stmt)).scalars().all()
    assert len(creds) == 0


@pytest.mark.asyncio
async def test_assistant_runtime_missing_credential(client: AsyncClient, auth_headers, db_session: AsyncSession, users):
    """When an Assistant has a provider configured but user has no key, return 404 with clean message."""
    u1, _ = users
    ps = PromptSystem(
        name="OpenAI Assistant",
        instructions="You are an OpenAI assistant.",
        owner_id=u1.id,
        ai_provider="openai",
        model="gpt-4o",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    # Ask a question using this assistant
    resp = await client.post(
        "/ask",
        json={"question": "Hello", "prompt_system_id": ps.id},
        headers=auth_headers["user1"],
    )
    assert resp.status_code == 404
    err_detail = resp.json()["detail"]
    assert "No API key configured for provider 'openai'" in err_detail
    assert "Settings → AI Providers" in err_detail
    # Never expose any secrets
    assert "sk-" not in str(resp.json())


@pytest.mark.asyncio
async def test_assistant_runtime_with_configured_credential(client: AsyncClient, auth_headers, db_session: AsyncSession, users, monkeypatch):
    """When an Assistant has a provider configured and user has key, runtime decrypts key and executes LLM."""
    u1, _ = users
    raw_key = "sk-mock-valid-key-1234"

    # Save user key
    await client.post(
        "/ai-providers",
        json={"provider": "openai", "api_key": raw_key},
        headers=auth_headers["user1"],
    )

    # Create assistant configured with openai
    ps = PromptSystem(
        name="OpenAI Assistant Configured",
        instructions="Answer briefly.",
        owner_id=u1.id,
        ai_provider="openai",
        model="gpt-4o",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    # Mock OpenAILLMWrapper create method to avoid external network calls during unit test
    called_with = {}
    from backend.app.rag.generator import OpenAILLMWrapper, _make_completion_response
    def mock_create(self, messages, model=None, temperature=0.3, **kwargs):
        called_with["api_key"] = self.api_key
        called_with["model"] = model or self.model
        called_with["messages"] = messages
        return _make_completion_response("Hello from mocked OpenAI!")

    monkeypatch.setattr(OpenAILLMWrapper, "create", mock_create)

    # Call /ask
    resp = await client.post(
        "/ask",
        json={"question": "What is 2+2?", "prompt_system_id": ps.id},
        headers=auth_headers["user1"],
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["answer"] == "Hello from mocked OpenAI!"
    assert called_with["api_key"] == raw_key
    assert called_with["model"] == "gpt-4o"
    # Never return API key in response
    assert "sk-" not in str(data)


@pytest.mark.asyncio
async def test_test_connection_endpoint_success_and_failure(client: AsyncClient, auth_headers, monkeypatch):
    """Test connection endpoint decrypts key and tests connectivity safely."""
    # 1. Test before key is configured -> returns failure
    resp = await client.post("/ai-providers/openai/test", headers=auth_headers["user1"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "openai"
    assert data["success"] is False
    assert "not found" in data["message"].lower()

    # 2. Save a key
    await client.post(
        "/ai-providers",
        json={"provider": "openai", "api_key": "sk-test-mock-openai-key-5678"},
        headers=auth_headers["user1"],
    )

    # 3. Mock _test_openai in credential_service
    import backend.app.services.credential_service as cred_svc
    from backend.app.schemas.ai_provider_credential import TestConnectionResponse
    async def mock_test_openai(key: str):
        return TestConnectionResponse(
            provider="openai",
            success=True,
            message="OpenAI connection successful.",
        )
    monkeypatch.setattr(cred_svc, "_test_openai", mock_test_openai)

    # 4. Test after key is configured -> returns success
    test_resp = await client.post("/ai-providers/openai/test", headers=auth_headers["user1"])
    assert test_resp.status_code == 200
    test_data = test_resp.json()
    assert test_data["success"] is True
    assert test_data["message"] == "OpenAI connection successful."
    # Never expose key
    assert "sk-" not in str(test_data)


@pytest.mark.asyncio
async def test_export_includes_provider_and_model_metadata(db_session: AsyncSession, users):
    """Export includes provider and model in metadata, but never credentials."""
    u1, _ = users
    ps = PromptSystem(
        name="Assistant With Model",
        instructions="Helpful assistant",
        owner_id=u1.id,
        ai_provider="anthropic",
        model="claude-3-5-sonnet",
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)

    exported = await export_prompt_system(db_session, ps)
    assert exported["assistant"]["ai_provider"] == "anthropic"
    assert exported["assistant"]["model"] == "claude-3-5-sonnet"
    assert "api_key" not in exported
    assert "encrypted_api_key" not in exported
    assert "credentials" not in exported
