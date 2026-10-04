"""Comprehensive tests for PDF document upload, ownership, listing, deletion, and security isolation."""
import io
import os
from pathlib import Path
from unittest.mock import patch
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
from backend.app.services.auth_service import create_access_token
from backend.app.services.document_service import document_service


VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


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
def client(db_session, tmp_path):
    """Provide a TestClient with overridden get_db dependency and isolated storage directory."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    original_base = document_service.base_dir
    document_service.base_dir = tmp_path

    with TestClient(app) as test_client:
        yield test_client

    document_service.base_dir = original_base
    app.dependency_overrides.clear()


@pytest.fixture
async def user_a(db_session):
    u = User(
        name="User A",
        email="user_a@example.com",
        password_hash="$2b$12$hashedpasswordforusera",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
async def user_b(db_session):
    u = User(
        name="User B",
        email="user_b@example.com",
        password_hash="$2b$12$hashedpasswordforuserb",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    return u


@pytest.fixture
def headers_a(user_a):
    token = create_access_token(data={"sub": str(user_a.id), "email": user_a.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def headers_b(user_b):
    token = create_access_token(data={"sub": str(user_b.id), "email": user_b.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
async def setup_systems(db_session, user_a, user_b):
    """Setup Prompt Systems and Modules for User A and User B."""
    # User A: System A1, System A2, Module A1, Module A2
    sys_a1 = PromptSystem(name="System A1", owner_id=user_a.id)
    sys_a2 = PromptSystem(name="System A2", owner_id=user_a.id)
    mod_a1 = PromptModule(name="Module A1", owner_id=user_a.id)
    mod_a2 = PromptModule(name="Module A2", owner_id=user_a.id)
    db_session.add_all([sys_a1, sys_a2, mod_a1, mod_a2])
    await db_session.commit()
    await db_session.refresh(sys_a1)
    await db_session.refresh(sys_a2)
    await db_session.refresh(mod_a1)
    await db_session.refresh(mod_a2)

    # Attach mod_a1 and mod_a2 to sys_a1
    ref_a1 = ModuleReference(prompt_system_id=sys_a1.id, module_id=mod_a1.id, enabled=True)
    ref_a2 = ModuleReference(prompt_system_id=sys_a1.id, module_id=mod_a2.id, enabled=True)
    db_session.add_all([ref_a1, ref_a2])

    # User B: System B1, Module B1 attached to System B1
    sys_b1 = PromptSystem(name="System B1", owner_id=user_b.id)
    mod_b1 = PromptModule(name="Module B1", owner_id=user_b.id)
    db_session.add_all([sys_b1, mod_b1])
    await db_session.commit()
    await db_session.refresh(sys_b1)
    await db_session.refresh(mod_b1)

    ref_b1 = ModuleReference(prompt_system_id=sys_b1.id, module_id=mod_b1.id, enabled=True)
    db_session.add(ref_b1)
    await db_session.commit()

    return {
        "sys_a1": sys_a1,
        "sys_a2": sys_a2,
        "mod_a1": mod_a1,
        "mod_a2": mod_a2,
        "sys_b1": sys_b1,
        "mod_b1": mod_b1,
    }


# ==============================================================================
# 1. User A uploads PDF.
# ==============================================================================
def test_1_user_a_uploads_pdf(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("sample.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    data = {"prompt_system_id": str(sys_a1.id)}

    res = client.post("/documents/upload", files=files, data=data, headers=headers_a)
    assert res.status_code == 201
    body = res.json()
    assert body["filename"] == "sample.pdf"
    assert body["prompt_system_id"] == sys_a1.id
    assert body["module_id"] is None
    assert "id" in body
    assert "created_at" in body


# ==============================================================================
# 2. User A can list PDF.
# ==============================================================================
def test_2_user_a_can_list_pdf(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("a_doc.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)

    res = client.get("/documents", headers=headers_a)
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) >= 1
    assert any(d["filename"] == "a_doc.pdf" for d in docs)


# ==============================================================================
# 3. User B cannot list User A PDF.
# ==============================================================================
def test_3_user_b_cannot_list_user_a_pdf(client, headers_a, headers_b, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("secret_a.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)

    # User B lists all documents
    res_b = client.get("/documents", headers=headers_b)
    assert res_b.status_code == 200
    docs_b = res_b.json()
    assert not any(d["filename"] == "secret_a.pdf" for d in docs_b)

    # User B filters by User A's prompt_system_id
    res_b_filtered = client.get(f"/documents?prompt_system_id={sys_a1.id}", headers=headers_b)
    assert res_b_filtered.status_code == 200
    assert len(res_b_filtered.json()) == 0


# ==============================================================================
# 4. User B cannot access User A document by ID.
# ==============================================================================
def test_4_user_b_cannot_access_user_a_document_by_id(client, headers_a, headers_b, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("private_a.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res_upload = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    doc_id = res_upload.json()["id"]

    # User B attempts to access it by ID
    res = client.get(f"/documents/{doc_id}", headers=headers_b)
    assert res.status_code == 404


# ==============================================================================
# 5. User B cannot delete User A document.
# ==============================================================================
def test_5_user_b_cannot_delete_user_a_document(client, headers_a, headers_b, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("delete_test.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res_upload = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    doc_id = res_upload.json()["id"]

    # User B attempts to delete
    res_del = client.delete(f"/documents/{doc_id}", headers=headers_b)
    assert res_del.status_code == 404

    # Document still exists for User A
    res_get = client.get(f"/documents/{doc_id}", headers=headers_a)
    assert res_get.status_code == 200


# ==============================================================================
# 6. User A can delete own PDF.
# ==============================================================================
def test_6_user_a_can_delete_own_pdf(client, headers_a, setup_systems, tmp_path):
    sys_a1 = setup_systems["sys_a1"]
    files = {"file": ("to_remove.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res_upload = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    doc_id = res_upload.json()["id"]

    # User A deletes own document
    res_del = client.delete(f"/documents/{doc_id}", headers=headers_a)
    assert res_del.status_code == 204

    # Document no longer exists
    res_get = client.get(f"/documents/{doc_id}", headers=headers_a)
    assert res_get.status_code == 404


# ==============================================================================
# 7. Parent document appears only in correct Prompt System.
# ==============================================================================
def test_7_parent_document_appears_only_in_correct_prompt_system(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    sys_a2 = setup_systems["sys_a2"]

    # Upload to sys_a1
    files = {"file": ("parent_a1.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)

    # Check sys_a1 documents
    res_a1 = client.get(f"/documents?prompt_system_id={sys_a1.id}&parent_only=true", headers=headers_a)
    assert res_a1.status_code == 200
    docs_a1 = res_a1.json()
    assert any(d["filename"] == "parent_a1.pdf" for d in docs_a1)

    # Check sys_a2 documents
    res_a2 = client.get(f"/documents?prompt_system_id={sys_a2.id}&parent_only=true", headers=headers_a)
    assert res_a2.status_code == 200
    docs_a2 = res_a2.json()
    assert not any(d["filename"] == "parent_a1.pdf" for d in docs_a2)


# ==============================================================================
# 8. Child document appears only in correct Child Assistant.
# ==============================================================================
def test_8_child_document_appears_only_in_correct_child_assistant(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    mod_a1 = setup_systems["mod_a1"]

    files = {"file": ("child_mod1.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res_upload = client.post(
        "/documents/upload",
        files=files,
        data={"prompt_system_id": str(sys_a1.id), "module_id": str(mod_a1.id)},
        headers=headers_a,
    )
    assert res_upload.status_code == 201
    assert res_upload.json()["module_id"] == mod_a1.id

    # Filter by mod_a1
    res = client.get(f"/documents?prompt_system_id={sys_a1.id}&module_id={mod_a1.id}", headers=headers_a)
    assert res.status_code == 200
    docs = res.json()
    assert len(docs) == 1
    assert docs[0]["filename"] == "child_mod1.pdf"
    assert docs[0]["module_id"] == mod_a1.id


# ==============================================================================
# 9. Child document does not appear in another Child Assistant.
# ==============================================================================
def test_9_child_document_does_not_appear_in_another_child_assistant(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    mod_a1 = setup_systems["mod_a1"]
    mod_a2 = setup_systems["mod_a2"]

    # Upload to mod_a1
    files = {"file": ("only_for_mod1.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post(
        "/documents/upload",
        files=files,
        data={"prompt_system_id": str(sys_a1.id), "module_id": str(mod_a1.id)},
        headers=headers_a,
    )

    # Check mod_a2
    res_mod2 = client.get(f"/documents?prompt_system_id={sys_a1.id}&module_id={mod_a2.id}", headers=headers_a)
    assert res_mod2.status_code == 200
    docs_mod2 = res_mod2.json()
    assert not any(d["filename"] == "only_for_mod1.pdf" for d in docs_mod2)

    # Check parent documents (parent_only=true)
    res_parent = client.get(f"/documents?prompt_system_id={sys_a1.id}&parent_only=true", headers=headers_a)
    assert res_parent.status_code == 200
    docs_parent = res_parent.json()
    assert not any(d["filename"] == "only_for_mod1.pdf" for d in docs_parent)


# ==============================================================================
# 10. Module from another Prompt System is rejected.
# ==============================================================================
def test_10_module_from_another_prompt_system_is_rejected(client, headers_a, setup_systems):
    sys_a2 = setup_systems["sys_a2"]  # mod_a1 is attached to sys_a1, not sys_a2
    mod_a1 = setup_systems["mod_a1"]

    files = {"file": ("invalid_combo.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res = client.post(
        "/documents/upload",
        files=files,
        data={"prompt_system_id": str(sys_a2.id), "module_id": str(mod_a1.id)},
        headers=headers_a,
    )
    assert res.status_code in (400, 404)
    assert "does not belong" in res.json()["detail"].lower() or "not found" in res.json()["detail"].lower()


# ==============================================================================
# 11. Prompt System owned by another user is rejected.
# ==============================================================================
def test_11_prompt_system_owned_by_another_user_is_rejected(client, headers_a, setup_systems):
    sys_b1 = setup_systems["sys_b1"]  # Owned by User B

    files = {"file": ("trespass.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res = client.post(
        "/documents/upload",
        files=files,
        data={"prompt_system_id": str(sys_b1.id)},
        headers=headers_a,  # User A trying to upload into User B's system
    )
    assert res.status_code == 404
    assert "not found or not owned" in res.json()["detail"].lower()


# ==============================================================================
# 12. Non-PDF upload is rejected.
# ==============================================================================
def test_12_non_pdf_upload_is_rejected(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]

    # Reject text file
    files_txt = {"file": ("test.txt", io.BytesIO(b"Hello world"), "text/plain")}
    res_txt = client.post("/documents/upload", files=files_txt, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    assert res_txt.status_code == 400

    # Reject ZIP
    files_zip = {"file": ("archive.zip", io.BytesIO(b"PK\x03\x04fakezip"), "application/zip")}
    res_zip = client.post("/documents/upload", files=files_zip, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    assert res_zip.status_code == 400

    # Reject disguised exe with .pdf extension (fails magic byte check)
    files_fake = {"file": ("evil.pdf", io.BytesIO(b"MZ\x90\x00executable content"), "application/pdf")}
    res_fake = client.post("/documents/upload", files=files_fake, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    assert res_fake.status_code == 400
    assert "header" in res_fake.json()["detail"].lower() or "pdf" in res_fake.json()["detail"].lower()


# ==============================================================================
# 13. Oversized PDF is rejected.
# ==============================================================================
def test_13_oversized_pdf_is_rejected(client, headers_a, setup_systems):
    sys_a1 = setup_systems["sys_a1"]

    # Temporarily set max size to 100 bytes
    with patch("backend.app.services.document_service.MAX_FILE_SIZE_BYTES", 100):
        large_bytes = VALID_PDF_BYTES + (b"A" * 200)
        files = {"file": ("large.pdf", io.BytesIO(large_bytes), "application/pdf")}
        res = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
        assert res.status_code == 400
        assert "exceeds" in res.json()["detail"].lower()


# ==============================================================================
# 14. Path traversal filename is safely handled.
# ==============================================================================
def test_14_path_traversal_filename_is_safely_handled(client, headers_a, setup_systems, tmp_path):
    sys_a1 = setup_systems["sys_a1"]

    traversal_filename = "../../../etc/passwd.pdf"
    files = {"file": (traversal_filename, io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    res = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    assert res.status_code == 201

    doc = res.json()
    stored_name = doc["stored_filename"]
    # Verify no path traversal characters in stored_filename
    assert ".." not in stored_name
    assert "/" not in stored_name
    assert "\\" not in stored_name


# ==============================================================================
# 15. Database failure does not leave an uncontrolled uploaded file.
# ==============================================================================
def test_15_database_failure_cleans_up_uploaded_file(client, headers_a, setup_systems, tmp_path):
    sys_a1 = setup_systems["sys_a1"]

    # Mock db.commit to raise an exception simulating database failure
    with patch("sqlalchemy.ext.asyncio.AsyncSession.commit", side_effect=RuntimeError("Simulated DB Crash")):
        files = {"file": ("crash_test.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
        res = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
        assert res.status_code == 500

    # Verify no files were left orphaned in the storage tree
    all_files = list(tmp_path.rglob("*.pdf"))
    assert len(all_files) == 0, f"Orphaned files remained: {all_files}"


# ==============================================================================
# 16. Two Users Multi-Scope Full Matrix (Section 14)
# ==============================================================================
def test_16_two_user_multi_scope_full_matrix(client, headers_a, headers_b, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    mod_a1 = setup_systems["mod_a1"]
    mod_a2 = setup_systems["mod_a2"]

    sys_b1 = setup_systems["sys_b1"]
    mod_b1 = setup_systems["mod_b1"]

    # 1. User A uploads Parent PDF A
    files_parent_a = {"file": ("Parent_PDF_A.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files_parent_a, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)

    # 2. User A uploads Child 1 PDF A
    files_c1_a = {"file": ("Child_1_PDF_A.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files_c1_a, data={"prompt_system_id": str(sys_a1.id), "module_id": str(mod_a1.id)}, headers=headers_a)

    # 3. User A uploads Child 2 PDF A
    files_c2_a = {"file": ("Child_2_PDF_A.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files_c2_a, data={"prompt_system_id": str(sys_a1.id), "module_id": str(mod_a2.id)}, headers=headers_a)

    # 4. User B uploads Parent PDF B
    files_parent_b = {"file": ("Parent_PDF_B.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files_parent_b, data={"prompt_system_id": str(sys_b1.id)}, headers=headers_b)

    # 5. User B uploads Child 1 PDF B
    files_c1_b = {"file": ("Child_1_PDF_B.pdf", io.BytesIO(VALID_PDF_BYTES), "application/pdf")}
    client.post("/documents/upload", files=files_c1_b, data={"prompt_system_id": str(sys_b1.id), "module_id": str(mod_b1.id)}, headers=headers_b)

    # Verification: User A Parent
    res_a_parent = client.get(f"/documents?prompt_system_id={sys_a1.id}", headers=headers_a)
    assert res_a_parent.status_code == 200
    docs_a_p = [d["filename"] for d in res_a_parent.json()]
    assert "Parent_PDF_A.pdf" in docs_a_p
    assert "Child_1_PDF_A.pdf" not in docs_a_p
    assert "Child_2_PDF_A.pdf" not in docs_a_p
    assert "Parent_PDF_B.pdf" not in docs_a_p
    assert "Child_1_PDF_B.pdf" not in docs_a_p

    # Verification: User A Child 1
    res_a_c1 = client.get(f"/documents?prompt_system_id={sys_a1.id}&module_id={mod_a1.id}", headers=headers_a)
    assert res_a_c1.status_code == 200
    docs_a_c1 = [d["filename"] for d in res_a_c1.json()]
    assert "Child_1_PDF_A.pdf" in docs_a_c1
    assert "Parent_PDF_A.pdf" not in docs_a_c1
    assert "Child_2_PDF_A.pdf" not in docs_a_c1
    assert "Parent_PDF_B.pdf" not in docs_a_c1

    # Verification: User A Child 2
    res_a_c2 = client.get(f"/documents?prompt_system_id={sys_a1.id}&module_id={mod_a2.id}", headers=headers_a)
    assert res_a_c2.status_code == 200
    docs_a_c2 = [d["filename"] for d in res_a_c2.json()]
    assert "Child_2_PDF_A.pdf" in docs_a_c2
    assert "Child_1_PDF_A.pdf" not in docs_a_c2
    assert "Parent_PDF_A.pdf" not in docs_a_c2

    # Verification: User B Parent
    res_b_parent = client.get(f"/documents?prompt_system_id={sys_b1.id}", headers=headers_b)
    assert res_b_parent.status_code == 200
    docs_b_p = [d["filename"] for d in res_b_parent.json()]
    assert "Parent_PDF_B.pdf" in docs_b_p
    assert "Child_1_PDF_B.pdf" not in docs_b_p
    assert "Parent_PDF_A.pdf" not in docs_b_p

    # Verification: User B Child 1
    res_b_c1 = client.get(f"/documents?prompt_system_id={sys_b1.id}&module_id={mod_b1.id}", headers=headers_b)
    assert res_b_c1.status_code == 200
    docs_b_c1 = [d["filename"] for d in res_b_c1.json()]
    assert "Child_1_PDF_B.pdf" in docs_b_c1
    assert "Parent_PDF_B.pdf" not in docs_b_c1
    assert "Child_1_PDF_A.pdf" not in docs_b_c1


# ==============================================================================
# 17. Scoped Document Text Context Grounding Isolation (Section 15)
# ==============================================================================
def test_17_document_text_context_grounding_isolation(client, headers_a, headers_b, setup_systems):
    sys_a1 = setup_systems["sys_a1"]
    mod_a1 = setup_systems["mod_a1"]
    sys_b1 = setup_systems["sys_b1"]

    # Construct a valid PDF containing text
    text_content = "Python was created by Guido van Rossum."
    stream_bytes = f"BT /F1 12 Tf 10 100 Td ({text_content}) Tj ET".encode("latin-1")
    pdf_with_text = (
        b"%PDF-1.4\n"
        b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
        b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
        b"3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R>> endobj\n"
        b"4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj\n"
        b"5 0 obj <</Length " + str(len(stream_bytes)).encode() + b">> stream\n" + stream_bytes + b"\nendstream\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n"
        b"trailer <</Size 6 /Root 1 0 R>>\nstartxref\n10\n%%EOF"
    )

    # Upload to User A Parent Assistant
    files = {"file": ("guido_python.pdf", io.BytesIO(pdf_with_text), "application/pdf")}
    res_upload = client.post("/documents/upload", files=files, data={"prompt_system_id": str(sys_a1.id)}, headers=headers_a)
    assert res_upload.status_code == 201

    # 1. User A Parent gets context
    res_ctx_a_parent = client.get(f"/documents/context?prompt_system_id={sys_a1.id}", headers=headers_a)
    assert res_ctx_a_parent.status_code == 200
    ctx_data_a = res_ctx_a_parent.json()
    assert ctx_data_a["count"] == 1
    assert "Guido van Rossum" in ctx_data_a["context_text"]

    # 2. User A Child 1 does NOT see the Parent's PDF
    res_ctx_a_child = client.get(f"/documents/context?prompt_system_id={sys_a1.id}&module_id={mod_a1.id}", headers=headers_a)
    assert res_ctx_a_child.status_code == 200
    ctx_data_child = res_ctx_a_child.json()
    assert ctx_data_child["count"] == 0
    assert "Guido van Rossum" not in ctx_data_child["context_text"]

    # 3. User B does NOT see User A's PDF
    res_ctx_b = client.get(f"/documents/context?prompt_system_id={sys_b1.id}", headers=headers_b)
    assert res_ctx_b.status_code == 200
    ctx_data_b = res_ctx_b.json()
    assert ctx_data_b["count"] == 0
    assert "Guido van Rossum" not in ctx_data_b["context_text"]
