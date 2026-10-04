"""test_assistant_context_integration.py
---------------------------------------
Comprehensive test suite validating Parent/Child Assistant context integration in PromptForge.

Tests:
  TEST 1: Parent Chat receives complete Prompt System configuration (instructions, persona, task, context, response format, variables).
  TEST 2: Child Chat receives complete Child Module configuration (instructions, context, variables, output contract).
  TEST 3: Child Input Context with Parent Instructions ON, Parent Variables ON, Previous Module Output OFF, User Input ON.
  TEST 4: Child Input Context with Parent Variables OFF (verifies parent variables are omitted).
  TEST 5: Child Input Context with Parent Instructions OFF (verifies parent instructions are omitted).
  TEST 6: Child Input Context with Previous Module Output ON (verifies previous child interaction is injected).
  TEST 7: Parent PDF upload - Parent Chat uses only its allowed documents.
  TEST 8: Child PDF upload - Child Chat uses only its allowed documents.
  TEST 9: Multi-tenant isolation - User A cannot access User B's variables, instructions, conversations, or documents.
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
from backend.app.models.prompt_module import PromptModule
from backend.app.models.module_reference import ModuleReference
from backend.app.models.conversation import Conversation, Message
from backend.app.models.prompt_run_history import PromptRunHistory
from backend.app.services.auth_service import create_access_token
from backend.app.services.runtime_context_builder import build_runtime_context
from backend.app.rag.retriever import retrieve_scoped_documents
from backend.app.rag.vectorstore import index_document_file, delete_scope_vectorstore


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
async def user_a(db_session) -> User:
    """Create test user A."""
    u = User(
        email="usera@promptforge.dev",
        name="User Alpha",
        password_hash="pw_hash_usera",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user_b(db_session) -> User:
    """Create test user B."""
    u = User(
        email="userb@promptforge.dev",
        name="User Beta",
        password_hash="pw_hash_userb",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
def auth_headers_a(user_a: User) -> dict:
    token = create_access_token(data={"sub": str(user_a.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_b(user_b: User) -> dict:
    token = create_access_token(data={"sub": str(user_b.id)})
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# TEST 1: Parent Chat Context Integration
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_1_parent_chat_receives_complete_configuration(db_session: AsyncSession, user_a: User):
    """TEST 1: Parent Chat receives instructions, persona, task, context, response format, and runtime variables."""
    system = PromptSystem(
        owner_id=user_a.id,
        name="BDE Master Assistant",
        description="Outbound sales prompt system for executive outreach",
        instructions=(
            "Persona: You are a professional BDE assistant.\n"
            "Task: Help user plan and draft high-converting B2B outreach.\n"
            "Context: Targeting C-level tech executives in North America."
        ),
        output_format="Return responses with a concise summary followed by clear bullet points.",
        variables=[
            {"name": "sender_name", "label": "Sender Name", "type": "text", "default": "Yogesh"},
            {"name": "company_name", "label": "Company Name", "type": "text", "default": "Spundan Tech"},
            {"name": "target_industry", "label": "Industry", "type": "text", "default": "FinTech"},
        ],
        examples=[
            {"title": "Initial Pitch", "input": "Reach out to CTO", "output": "Hi CTO, noticed your growth..."},
        ],
    )
    db_session.add(system)
    await db_session.commit()
    await db_session.refresh(system)

    # Build context for Parent Chat with optional runtime overrides
    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="What is my name and company?",
        module_id=None,
        runtime_variables={"sender_name": "Yogesh Sharma"},  # Overriding default
    )

    prompt = ctx.system_prompt
    assert "BDE Master Assistant" in prompt
    assert "Persona: You are a professional BDE assistant." in prompt
    assert "Task: Help user plan and draft high-converting B2B outreach." in prompt
    assert "Context: Targeting C-level tech executives in North America." in prompt
    assert "Return responses with a concise summary" in prompt
    assert "sender_name = Yogesh Sharma" in prompt
    assert "company_name = Spundan Tech" in prompt
    assert "target_industry = FinTech" in prompt

    assert ctx.parent_context is not None
    assert ctx.parent_context["name"] == "BDE Master Assistant"
    assert ctx.resolved_variables["sender_name"] == "Yogesh Sharma"
    assert ctx.child_context is None


# ---------------------------------------------------------------------------
# TEST 2: Child Chat Context Integration
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_2_child_chat_receives_complete_child_configuration(db_session: AsyncSession, user_a: User):
    """TEST 2: Child Chat receives Child instructions, context, variables, and output contract."""
    system = PromptSystem(
        owner_id=user_a.id,
        name="Sales System",
        instructions="Parent instructions here.",
    )
    db_session.add(system)
    await db_session.flush()

    child = PromptModule(
        owner_id=user_a.id,
        name="LinkedIn Follow-Up Module",
        description="Crafts high-impact second touchpoint LinkedIn messages",
        instructions="Create a 3-sentence LinkedIn follow-up referencing our previous interaction.",
        output_contract="Output must be under 300 characters, no hashtags, with a clear question at the end.",
        variables=[
            {"name": "channel", "type": "text", "default": "LinkedIn DM"},
            {"name": "urgency", "type": "text", "default": "Medium"},
        ],
        input_context=["user_input"],
    )
    db_session.add(child)
    await db_session.flush()

    ref = ModuleReference(prompt_system_id=system.id, module_id=child.id, enabled=True)
    db_session.add(ref)
    await db_session.commit()

    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="Draft follow-up for Alex",
        module_id=child.id,
    )

    prompt = ctx.system_prompt
    assert "LinkedIn Follow-Up Module" in prompt
    assert "Crafts high-impact second touchpoint LinkedIn messages" in prompt
    assert "Create a 3-sentence LinkedIn follow-up" in prompt
    assert "Output must be under 300 characters" in prompt
    assert "channel = LinkedIn DM" in prompt
    assert "urgency = Medium" in prompt
    assert ctx.child_context is not None
    assert ctx.child_context["name"] == "LinkedIn Follow-Up Module"


# ---------------------------------------------------------------------------
# TEST 3: Child Input Context with Parent Instructions & Variables ON
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_3_child_input_context_parent_instructions_and_variables_on(db_session: AsyncSession, user_a: User):
    """TEST 3: Child receives both Parent Instructions and Parent Variables when enabled in input_context."""
    system = PromptSystem(
        owner_id=user_a.id,
        name="BDE Suite",
        instructions="You are a professional BDE assistant.",
        variables=[{"name": "sender_name", "default": "Yogesh"}],
    )
    db_session.add(system)
    await db_session.flush()

    child = PromptModule(
        owner_id=user_a.id,
        name="Outreach Drafter",
        instructions="Create a LinkedIn outreach message.",
        input_context=["parent_instructions", "parent_variables", "user_input"],
    )
    db_session.add(child)
    await db_session.flush()

    ref = ModuleReference(prompt_system_id=system.id, module_id=child.id, enabled=True)
    db_session.add(ref)
    await db_session.commit()

    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="Hello",
        module_id=child.id,
    )

    prompt = ctx.system_prompt
    # Must receive parent instructions
    assert "[Parent System Instructions" in prompt
    assert "You are a professional BDE assistant." in prompt
    # Must receive parent variables
    assert "[Parent Variables]" in prompt
    assert "sender_name = Yogesh" in prompt
    # Must receive child instructions
    assert "[Child Module Instructions]" in prompt
    assert "Create a LinkedIn outreach message." in prompt
    # Previous module output was OFF
    assert "[Previous Module / Child Output]" not in prompt


# ---------------------------------------------------------------------------
# TEST 4: Child Input Context with Parent Variables OFF
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_4_child_parent_variables_off(db_session: AsyncSession, user_a: User):
    """TEST 4: When Parent Variables is OFF, parent variables are strictly omitted from Child context."""
    system = PromptSystem(
        owner_id=user_a.id,
        name="BDE Suite",
        instructions="You are a professional BDE assistant.",
        variables=[{"name": "confidential_api_token", "default": "secret_12345"}],
    )
    db_session.add(system)
    await db_session.flush()

    child = PromptModule(
        owner_id=user_a.id,
        name="Strict Isolated Child",
        instructions="Generate public marketing copy.",
        input_context=["parent_instructions", "user_input"],  # parent_variables is OFF
    )
    db_session.add(child)
    await db_session.flush()

    ref = ModuleReference(prompt_system_id=system.id, module_id=child.id, enabled=True)
    db_session.add(ref)
    await db_session.commit()

    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="Help",
        module_id=child.id,
    )

    prompt = ctx.system_prompt
    assert "You are a professional BDE assistant." in prompt
    # Parent variables must NOT be present
    assert "[Parent Variables]" not in prompt
    assert "confidential_api_token" not in prompt
    assert "secret_12345" not in prompt


# ---------------------------------------------------------------------------
# TEST 5: Child Input Context with Parent Instructions OFF
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_5_child_parent_instructions_off(db_session: AsyncSession, user_a: User):
    """TEST 5: When Parent Instructions is OFF, parent instructions are strictly omitted from Child context."""
    system = PromptSystem(
        owner_id=user_a.id,
        name="BDE Suite",
        instructions="TOP_SECRET_PARENT_INTERNAL_GUIDELINES",
        variables=[{"name": "product_name", "default": "PromptForge"}],
    )
    db_session.add(system)
    await db_session.flush()

    child = PromptModule(
        owner_id=user_a.id,
        name="Child Without Parent Instructions",
        instructions="Create standalone code snippet.",
        input_context=["parent_variables", "user_input"],  # parent_instructions is OFF
    )
    db_session.add(child)
    await db_session.flush()

    ref = ModuleReference(prompt_system_id=system.id, module_id=child.id, enabled=True)
    db_session.add(ref)
    await db_session.commit()

    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="Code",
        module_id=child.id,
    )

    prompt = ctx.system_prompt
    # Parent instructions must NOT be present
    assert "TOP_SECRET_PARENT_INTERNAL_GUIDELINES" not in prompt
    assert "[Parent System Instructions" not in prompt
    # Parent variables ARE present
    assert "[Parent Variables]" in prompt
    assert "product_name = PromptForge" in prompt


# ---------------------------------------------------------------------------
# TEST 6: Previous Module Output Integration
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_6_previous_module_output_enabled(db_session: AsyncSession, user_a: User):
    """TEST 6: When Previous Module Output is ON, recent assistant outputs from prior modules in the system are injected."""
    system = PromptSystem(owner_id=user_a.id, name="Sales System")
    db_session.add(system)
    await db_session.flush()

    child_1 = PromptModule(owner_id=user_a.id, name="Lead Qualifier", instructions="Qualify lead")
    child_2 = PromptModule(
        owner_id=user_a.id,
        name="Email Drafter",
        instructions="Draft email",
        input_context=["previous_module_output", "user_input"],
    )
    db_session.add_all([child_1, child_2])
    await db_session.flush()

    db_session.add_all([
        ModuleReference(prompt_system_id=system.id, module_id=child_1.id, enabled=True),
        ModuleReference(prompt_system_id=system.id, module_id=child_2.id, enabled=True),
    ])
    await db_session.flush()

    # Create previous interaction with child_1
    conv_1 = Conversation(user_id=user_a.id, prompt_system_id=system.id, module_id=child_1.id, title="Lead Alex")
    db_session.add(conv_1)
    await db_session.flush()

    msg_1 = Message(conversation_id=conv_1.id, role="assistant", content="QUALIFIED: Alex is CTO at FinTech Corp looking for RAG.")
    db_session.add(msg_1)
    await db_session.commit()

    # Now run child_2 with Previous Module Output enabled
    ctx = await build_runtime_context(
        db=db_session,
        user_id=user_a.id,
        prompt_system_id=system.id,
        question="Write the email based on qualified lead",
        module_id=child_2.id,
    )

    prompt = ctx.system_prompt
    assert "[Previous Module / Child Output]" in prompt
    assert "QUALIFIED: Alex is CTO at FinTech Corp looking for RAG." in prompt


# ---------------------------------------------------------------------------
# TEST 7 & 8: Scoped PDF / RAG Isolation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_7_and_8_parent_and_child_rag_isolation(tmp_path):
    """TEST 7 & 8: Parent Chat uses only Parent documents; Child Chat uses only Child documents."""
    user_id = 999
    system_id = 888
    child_id = 777

    # Create two temporary text files as mock documents
    parent_file = tmp_path / "parent_doc.txt"
    parent_file.write_text("Parent Confidential: Policy guidelines for quarterly targets.")

    child_file = tmp_path / "child_doc.txt"
    child_file.write_text("Child Confidential: Code snippets for Python FastAPI microservice.")

    try:
        # Index document for Parent (module_id=None)
        await index_document_file(
            file_path=str(parent_file),
            user_id=user_id,
            prompt_system_id=system_id,
            module_id=None,
            document_id="doc_parent_1",
            filename="parent_doc.txt",
        )

        # Index document for Child (module_id=child_id)
        await index_document_file(
            file_path=str(child_file),
            user_id=user_id,
            prompt_system_id=system_id,
            module_id=child_id,
            document_id="doc_child_1",
            filename="child_doc.txt",
        )

        # Retrieve for Parent: must only retrieve parent document
        parent_docs = retrieve_scoped_documents(
            user_id=user_id,
            prompt_system_id=system_id,
            module_id=None,
            question="Policy guidelines",
        )
        assert len(parent_docs) > 0
        assert "Policy guidelines" in parent_docs[0].page_content
        assert "Python FastAPI" not in parent_docs[0].page_content

        # Retrieve for Child: must only retrieve child document
        child_docs = retrieve_scoped_documents(
            user_id=user_id,
            prompt_system_id=system_id,
            module_id=child_id,
            question="FastAPI microservice",
        )
        assert len(child_docs) > 0
        assert "Python FastAPI" in child_docs[0].page_content
        assert "Policy guidelines" not in child_docs[0].page_content

    finally:
        # Cleanup vector stores
        delete_scope_vectorstore(user_id=user_id, prompt_system_id=system_id, module_id=None)
        delete_scope_vectorstore(user_id=user_id, prompt_system_id=system_id, module_id=child_id)


# ---------------------------------------------------------------------------
# TEST 9: Multi-Tenant Isolation
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_9_multi_tenant_isolation_between_users(db_session: AsyncSession, user_a: User, user_b: User):
    """TEST 9: User A's Prompt System, instructions, variables, and history are not accessible to User B."""
    system_a = PromptSystem(
        owner_id=user_a.id,
        name="User A Confidential System",
        instructions="User A Secret Strategy",
        variables=[{"name": "secret_key", "default": "USER_A_KEY_999"}],
    )
    db_session.add(system_a)
    await db_session.commit()
    await db_session.refresh(system_a)

    # User B attempts to build context for User A's system
    ctx_b = await build_runtime_context(
        db=db_session,
        user_id=user_b.id,  # User B is requesting
        prompt_system_id=system_a.id,
        question="What is the secret?",
        module_id=None,
    )

    # Prompt System is owned by user A, so for user B system is None / not found
    assert ctx_b.parent_context is None
    assert "User A Secret Strategy" not in ctx_b.system_prompt
    assert "USER_A_KEY_999" not in ctx_b.system_prompt
