import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formatRagError, RagApiError, ragApi, type RagSource } from "./ragApi";

describe("RAG Assistant API & Integration Test Suite", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("1. RAG menu & navigation: ensures RAG API client exports all necessary integration endpoints", () => {
    assert.equal(typeof ragApi.checkHealth, "function");
    assert.equal(typeof ragApi.getStatus, "function");
    assert.equal(typeof ragApi.uploadDocument, "function");
    assert.equal(typeof ragApi.deleteDocuments, "function");
    assert.equal(typeof ragApi.askQuestion, "function");
    assert.equal(typeof ragApi.chat, "function");
  });

  it("2. RAG page loads: checkHealth verifies connectivity with RAG backend", async () => {
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.match(url.toString(), /\/health$/);
      assert.equal(init?.method, "GET");
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    };

    const res = await ragApi.checkHealth();
    assert.equal(res.status, "ok");
  });

  it("3. Document upload calls the correct API endpoint and parameters", async () => {
    let capturedMethod = "";
    let capturedUrl = "";
    let capturedBody: FormData | null = null;

    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedMethod = init?.method || "";
      capturedBody = init?.body as FormData;
      return new Response(
        JSON.stringify({
          message: "Document uploaded successfully.",
          filename: "syllabus.pdf",
          chunks: 8,
        }),
        { status: 200 }
      );
    };

    const file = new File(["test syllabus data"], "syllabus.pdf", {
      type: "application/pdf",
    });
    const res = await ragApi.uploadDocument(file);

    assert.match(capturedUrl, /\/upload$/);
    assert.equal(capturedMethod, "POST");
    assert.ok(capturedBody instanceof FormData);
    assert.equal(res.filename, "syllabus.pdf");
    assert.equal(res.chunks, 8);
  });

  it("4. Documents are displayed: getStatus returns active indexed document metadata", async () => {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      assert.match(url.toString(), /\/status$/);
      return new Response(
        JSON.stringify({ has_document: true, filename: "machine_learning.pdf" }),
        { status: 200 }
      );
    };

    const status = await ragApi.getStatus();
    assert.equal(status.has_document, true);
    assert.equal(status.filename, "machine_learning.pdf");
  });

  it("5. Empty state works: getStatus returns false when no document is indexed", async () => {
    globalThis.fetch = async (url: RequestInfo | URL) => {
      assert.match(url.toString(), /\/status$/);
      return new Response(
        JSON.stringify({ has_document: false, filename: null }),
        { status: 200 }
      );
    };

    const status = await ragApi.getStatus();
    assert.equal(status.has_document, false);
    assert.equal(status.filename, null);
  });

  it("6. Chat request sends the correct payload to /ask endpoint", async () => {
    let capturedPayload: { question: string; session_id: string } | null = null;

    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.match(url.toString(), /\/ask$/);
      assert.equal(init?.method, "POST");
      capturedPayload = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          answer: "Linear regression finds the best fitting line.",
          sources: [{ source: "data/uploads/ml.pdf", page: 12 }],
        }),
        { status: 200 }
      );
    };

    const res = await ragApi.askQuestion(
      "What is linear regression?",
      "session-test-uuid-456"
    );

    assert.deepEqual(capturedPayload, {
      question: "What is linear regression?",
      session_id: "session-test-uuid-456",
    });
    assert.match(res.answer, /Linear regression/);
  });

  it("7. Sources & Citations are returned and formatted cleanly", async () => {
    const mockSources: RagSource[] = [
      { source: "data/uploads/chapter1.pdf", page: 3 },
      { source: "data/uploads/chapter2.pdf", page: 15 },
    ];

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          answer: "Neural networks utilize backpropagation.",
          sources: mockSources,
        }),
        { status: 200 }
      );
    };

    const res = await ragApi.askQuestion("How do neural nets train?", "s-1");
    assert.equal(res.sources.length, 2);
    assert.equal(res.sources[0].source, "data/uploads/chapter1.pdf");
    assert.equal(res.sources[0].page, 3);
    assert.equal(res.sources[1].page, 15);
  });

  it("8. API error handling works for validation and backend errors", () => {
    assert.equal(
      formatRagError(400, { detail: "Unsupported file type." }),
      "Unsupported file type."
    );
    assert.equal(
      formatRagError(413, null),
      "File exceeds the maximum allowed size (10 MB)."
    );
    assert.equal(
      formatRagError(500, null),
      "The RAG backend encountered an error. Please try again."
    );
  });

  it("9. Network connectivity failure throws custom RagApiError with status 0", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };

    await assert.rejects(
      async () => {
        await ragApi.askQuestion("Will this fail?", "s-fail");
      },
      (err: unknown) => {
        assert.ok(err instanceof RagApiError);
        assert.equal(err.status, 0);
        assert.match(err.message, /Unable to connect to RAG backend/);
        return true;
      }
    );
  });

  it("10. Delete documents endpoint clears vector store successfully", async () => {
    globalThis.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
      assert.match(url.toString(), /\/documents$/);
      assert.equal(init?.method, "DELETE");
      return new Response(
        JSON.stringify({
          message: "All documents and vector store index cleared successfully.",
        }),
        { status: 200 }
      );
    };

    const res = await ragApi.deleteDocuments();
    assert.match(res.message, /cleared successfully/);
  });
});
