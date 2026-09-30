"""Tests for the Prompt System Sharing feature.

Covers:
1. Default private visibility
2. Owner can enable/disable public sharing
3. Share token generation and validation
4. Public access via share token
5. Public user cannot edit/delete original
6. Authenticated user can create a private copy
7. Copy independence (new ID, private, no shared token)
8. Original remains unchanged after copy
9. Module references are preserved in copies
10. Shared Prompt Run via existing flow
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
async def owner(db_session):
    """Create the owner user."""
    user = User(
        name="Owner",
        email="owner@promptforge.io",
        password_hash="$2b$12$hashedpassword_owner",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def other_user(db_session):
    """Create a second user for copy/access testing."""
    user = User(
        name="Other User",
        email="other@promptforge.io",
        password_hash="$2b$12$hashedpassword_other",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def owner_headers(owner):
    """JWT headers for the owner."""
    token = create_access_token(data={"sub": str(owner.id), "email": owner.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_headers(other_user):
    """JWT headers for the other user."""
    token = create_access_token(data={"sub": str(other_user.id), "email": other_user.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def prompt_system(db_session, owner):
    """Create a Prompt System owned by the owner."""
    ps = PromptSystem(
        name="Test Sharing System",
        description="A system for sharing tests",
        owner_id=owner.id,
        instructions="You are a helpful assistant. Use {topic} to guide your response.",
        variables=[
            {"name": "topic", "label": "Topic", "type": "text", "required": True}
        ],
        examples=[{"input": "AI", "output": "AI summary"}],
        output_format={"type": "markdown"},
        modules=["module_a"],
        version=1,
        visibility="private",
        share_token=None,
    )
    db_session.add(ps)
    await db_session.commit()
    await db_session.refresh(ps)
    return ps


@pytest.fixture
async def prompt_module(db_session, owner):
    """Create a reusable PromptModule owned by the owner."""
    mod = PromptModule(
        name="Test Module",
        description="A test module",
        owner_id=owner.id,
        instructions="Module instructions with {mod_var}",
        variables=[{"name": "mod_var", "label": "Module Variable", "type": "text", "required": False}],
    )
    db_session.add(mod)
    await db_session.commit()
    await db_session.refresh(mod)
    return mod


@pytest.fixture
async def module_reference(db_session, prompt_system, prompt_module):
    """Attach the module to the prompt system via a ModuleReference."""
    ref = ModuleReference(
        prompt_system_id=prompt_system.id,
        module_id=prompt_module.id,
        input_mapping={"parent_variables": "{parent_variables}"},
        output_mapping={"result": "{output}"},
        enabled=True,
    )
    db_session.add(ref)
    await db_session.commit()
    await db_session.refresh(ref)
    return ref


# ────────────────────────────────────────────────────────────────────────
# 1. Default private visibility
# ────────────────────────────────────────────────────────────────────────

def test_new_prompt_system_defaults_to_private(client, owner, owner_headers):
    """A newly created Prompt System must default to private visibility."""
    resp = client.post(
        "/prompt-systems",
        json={"name": "Private By Default"},
        headers=owner_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["visibility"] == "private"
    assert data["share_token"] is None


# ────────────────────────────────────────────────────────────────────────
# 2. Owner can enable public sharing
# ────────────────────────────────────────────────────────────────────────

def test_owner_enable_public_sharing(client, owner, owner_headers, prompt_system):
    """Owner can change visibility to public_link and receives a share token."""
    resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["visibility"] == "public_link"
    assert data["share_token"] is not None
    assert len(data["share_token"]) > 20  # secure token length
    assert data["share_url"] is not None


# ────────────────────────────────────────────────────────────────────────
# 3. Owner receives/generates share token
# ────────────────────────────────────────────────────────────────────────

def test_owner_gets_sharing_status(client, owner, owner_headers, prompt_system):
    """Owner can retrieve sharing status via GET."""
    resp = client.get(
        f"/prompt-systems/{prompt_system.id}/sharing",
        headers=owner_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["visibility"] == "private"
    assert data["share_token"] is None


# ────────────────────────────────────────────────────────────────────────
# 4. Owner can disable sharing
# ────────────────────────────────────────────────────────────────────────

def test_owner_disable_sharing(client, owner, owner_headers, prompt_system):
    """Owner can switch back to private after enabling public sharing."""
    # Enable first
    client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    # Disable
    resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "private"},
        headers=owner_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["visibility"] == "private"
    assert data["share_token"] is None


# ────────────────────────────────────────────────────────────────────────
# 5. Public user can access valid shared Prompt System
# ────────────────────────────────────────────────────────────────────────

def test_public_access_valid_shared_system(client, owner, owner_headers, prompt_system):
    """A valid share token gives public access to the shared system."""
    # Enable sharing
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Access publicly (no auth)
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Sharing System"
    assert data["share_token"] == token
    assert "owner_id" not in data  # no owner info exposed


# ────────────────────────────────────────────────────────────────────────
# 6. Invalid share token is rejected
# ────────────────────────────────────────────────────────────────────────

def test_invalid_share_token_rejected(client):
    """An invalid/random share token returns 404."""
    resp = client.get("/shared/totally_invalid_token_abc123")
    assert resp.status_code == 404


# ────────────────────────────────────────────────────────────────────────
# 7. Private Prompt System cannot be accessed through share route
# ────────────────────────────────────────────────────────────────────────

def test_private_system_not_accessible_via_share_route(client, owner, owner_headers, prompt_system, db_session):
    """Even if a share_token exists, a private system is not accessible via /shared."""
    # Enable then disable sharing
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Disable sharing
    client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "private"},
        headers=owner_headers,
    )

    # Try to access via old token
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 404


# ────────────────────────────────────────────────────────────────────────
# 8. Disabled share token no longer works
# ────────────────────────────────────────────────────────────────────────

def test_disabled_share_token_no_longer_works(client, owner, owner_headers, prompt_system):
    """After disabling sharing, the share link must return 404."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Disable
    client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "private"},
        headers=owner_headers,
    )

    # Attempt public access
    resp = client.get(f"/shared/{token}")
    assert resp.status_code == 404


# ────────────────────────────────────────────────────────────────────────
# 9. Public user cannot edit original Prompt System
# ────────────────────────────────────────────────────────────────────────

def test_public_user_cannot_edit_original(client, owner, owner_headers, prompt_system):
    """An unauthenticated user cannot PUT/PATCH the original system."""
    resp = client.put(
        f"/prompt-systems/{prompt_system.id}",
        json={"name": "Hacked Name"},
    )
    assert resp.status_code == 401


# ────────────────────────────────────────────────────────────────────────
# 10. Public user cannot delete original Prompt System
# ────────────────────────────────────────────────────────────────────────

def test_public_user_cannot_delete_original(client, owner, owner_headers, prompt_system):
    """An unauthenticated user cannot DELETE the original system."""
    resp = client.delete(f"/prompt-systems/{prompt_system.id}")
    assert resp.status_code == 401


# ────────────────────────────────────────────────────────────────────────
# 11. Authenticated user can create a copy
# ────────────────────────────────────────────────────────────────────────

def test_authenticated_user_can_copy(client, owner, owner_headers, other_user, other_headers, prompt_system):
    """An authenticated user can POST /shared/{token}/copy."""
    # Enable sharing
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Copy as other user
    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Sharing System (Copy)"
    assert data["owner_id"] == other_user.id


# ────────────────────────────────────────────────────────────────────────
# 12. Copied Prompt System belongs to copying user
# ────────────────────────────────────────────────────────────────────────

def test_copied_system_belongs_to_copying_user(client, owner, owner_headers, other_user, other_headers, prompt_system):
    """The copy must be owned by the user who created it."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    assert resp.json()["owner_id"] == other_user.id


# ────────────────────────────────────────────────────────────────────────
# 13. Copied Prompt System is private
# ────────────────────────────────────────────────────────────────────────

def test_copied_system_is_private(client, owner, owner_headers, other_headers, prompt_system):
    """The copy must have visibility=private."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["visibility"] == "private"


# ────────────────────────────────────────────────────────────────────────
# 14. Copied Prompt System receives a new ID
# ────────────────────────────────────────────────────────────────────────

def test_copied_system_gets_new_id(client, owner, owner_headers, other_headers, prompt_system):
    """The copy must have a different database ID from the original."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    assert resp.json()["id"] != prompt_system.id


# ────────────────────────────────────────────────────────────────────────
# 15. Copied Prompt System does not reuse original share token
# ────────────────────────────────────────────────────────────────────────

def test_copied_system_no_share_token(client, owner, owner_headers, other_headers, prompt_system):
    """The copy must not inherit the original's share_token."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["share_token"] is None
    assert data["share_token"] != token


# ────────────────────────────────────────────────────────────────────────
# 16. Original Prompt System remains unchanged after copying
# ────────────────────────────────────────────────────────────────────────

def test_original_unchanged_after_copy(client, owner, owner_headers, other_headers, prompt_system):
    """The original must not be modified when someone copies it."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Copy
    client.post(f"/shared/{token}/copy", headers=other_headers)

    # Verify original
    resp = client.get(
        f"/prompt-systems/{prompt_system.id}",
        headers=owner_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Sharing System"
    assert data["owner_id"] == owner.id
    assert data["visibility"] == "public_link"


# ────────────────────────────────────────────────────────────────────────
# 17. Copied modules/configuration are preserved correctly
# ────────────────────────────────────────────────────────────────────────

def test_copy_preserves_configuration(client, owner, owner_headers, other_headers, prompt_system):
    """The copy must preserve instructions, variables, examples, etc."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["instructions"] == prompt_system.instructions
    assert data["variables"] == prompt_system.variables
    assert data["examples"] == prompt_system.examples
    assert data["output_format"] == prompt_system.output_format


# ────────────────────────────────────────────────────────────────────────
# 18. Owner authorization remains enforced
# ────────────────────────────────────────────────────────────────────────

def test_non_owner_cannot_change_sharing(client, owner, owner_headers, other_headers, prompt_system):
    """A non-owner cannot change the sharing settings."""
    resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=other_headers,
    )
    assert resp.status_code == 403


def test_non_owner_cannot_get_sharing_status(client, owner, owner_headers, other_headers, prompt_system):
    """A non-owner cannot read sharing status."""
    resp = client.get(
        f"/prompt-systems/{prompt_system.id}/sharing",
        headers=other_headers,
    )
    assert resp.status_code == 403


# ────────────────────────────────────────────────────────────────────────
# 19. Shared Prompt System can use the existing Prompt Run flow
# ────────────────────────────────────────────────────────────────────────

def test_shared_system_run(client, owner, owner_headers, prompt_system):
    """A public shared system can be run via POST /shared/{token}/run."""
    # Enable sharing
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # Run (no auth required)
    resp = client.post(
        f"/shared/{token}/run",
        json={"variables": {"topic": "Artificial Intelligence"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "resolved_prompt" in data
    assert "Artificial Intelligence" in data["resolved_prompt"]


# ────────────────────────────────────────────────────────────────────────
# 20. Existing authentication tests still pass (non-regression)
# ────────────────────────────────────────────────────────────────────────

def test_unauthenticated_cannot_access_private_endpoints(client):
    """Unauthenticated requests to private endpoints must be rejected."""
    resp = client.get("/prompt-systems")
    assert resp.status_code == 401

    resp = client.post("/prompt-systems", json={"name": "Test"})
    assert resp.status_code == 401


def test_invalid_visibility_value_rejected(client, owner, owner_headers, prompt_system):
    """An invalid visibility value must be rejected."""
    resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "team_only"},
        headers=owner_headers,
    )
    assert resp.status_code == 400


def test_copy_requires_authentication(client, owner, owner_headers, prompt_system):
    """Copying a shared system requires authentication."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    # No auth
    resp = client.post(f"/shared/{token}/copy")
    assert resp.status_code == 401


def test_copy_preserves_module_references(client, owner, owner_headers, other_user, other_headers, prompt_system, prompt_module, module_reference, db_session):
    """When copying, ModuleReferences are duplicated correctly."""
    enable_resp = client.patch(
        f"/prompt-systems/{prompt_system.id}/sharing",
        json={"visibility": "public_link"},
        headers=owner_headers,
    )
    token = enable_resp.json()["share_token"]

    resp = client.post(f"/shared/{token}/copy", headers=other_headers)
    assert resp.status_code == 201
    copy_id = resp.json()["id"]

    # Verify the copy has its own module reference pointing to the same module
    import asyncio
    async def check_refs():
        stmt = select(ModuleReference).where(ModuleReference.prompt_system_id == copy_id)
        result = await db_session.execute(stmt)
        refs = result.scalars().all()
        assert len(refs) == 1
        assert refs[0].module_id == prompt_module.id
        assert refs[0].prompt_system_id == copy_id
        assert refs[0].input_mapping == {"parent_variables": "{parent_variables}"}
        assert refs[0].output_mapping == {"result": "{output}"}

    asyncio.get_event_loop().run_until_complete(check_refs())
