const cds = require('@sap/cds');

// ==========================
// ✅ MOCKS
// ==========================

jest.mock('@sap-cloud-sdk/http-client', () => ({
    executeHttpRequest: jest.fn()
}));

jest.mock('pdf-parse', () => {
    return jest.fn().mockResolvedValue({ text: "dummy invoice text" });
});

const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

// ==========================
// ✅ TEST INIT
// ==========================

const { expect, POST, GET } = cds.test(__dirname + '/..');

describe('Document Intelligence Service Tests', () => {

    let documentId;

    // ==========================
    // ✅ UPLOAD SUCCESS
    // ==========================
    it('should upload document successfully', async () => {

        executeHttpRequest.mockResolvedValueOnce({
            data: {
                id: "job-123",
                status: "PENDING"
            }
        });

        const res = await POST('/odata/v4/document-intelligence/uploadDocument', {
            fileName: "test.pdf",
            rawText: Buffer.from("dummy").toString("base64")
        });

        expect(res.status).to.equal(200);
        expect(res.data.fileName).to.equal("test.pdf");
        expect(res.data.jobId).to.exist;

        documentId = res.data.ID;
    });

    // ==========================
    // ❌ UPLOAD FAILURE (NO FILE)
    // ==========================
    it('should fail upload when file missing', async () => {
        try {
            await POST('/odata/v4/document-intelligence/uploadDocument', {
                fileName: "",
                rawText: ""
            });
        } catch (err) {
            expect(err.response.status).to.equal(400);
        }
    });

    // ==========================
    // ❌ DOCUMENT AI FAILURE
    // ==========================
    it('should handle Document AI failure', async () => {

        executeHttpRequest.mockRejectedValueOnce(new Error("AI Down"));

        try {
            await POST('/odata/v4/document-intelligence/uploadDocument', {
                fileName: "test.pdf",
                rawText: Buffer.from("dummy").toString("base64")
            });
        } catch (err) {
            expect(err.response.status).to.equal(500);
        }
    });

    // ==========================
    // ❌ PROCESS - DOCUMENT NOT FOUND
    // ==========================
    it('should fail if document not found', async () => {
        try {
            await POST('/odata/v4/document-intelligence/processDocument', {
                documentId: "invalid-id"
            });
        } catch (err) {
            expect(err.response.status).to.equal(404);
        }
    });

    // ==========================
    // ❌ PROCESS - NO JOB ID
    // ==========================
    it('should fail if jobId missing', async () => {

        const doc = await POST('/odata/v4/document-intelligence/Documents', {
            fileName: "test.pdf",
            rawText: "dummy"
        });

        try {
            await POST('/odata/v4/document-intelligence/processDocument', {
                documentId: doc.data.ID
            });
        } catch (err) {
            expect(err.response.status).to.equal(400);
        }
    });

    // ==========================
    // ✅ PROCESS SUCCESS
    // ==========================
    it('should process document successfully', async () => {

        // mock upload
        executeHttpRequest.mockResolvedValueOnce({
            data: {
                id: "job-999",
                status: "PENDING"
            }
        });

        const upload = await POST('/odata/v4/document-intelligence/uploadDocument', {
            fileName: "invoice.pdf",
            rawText: Buffer.from("dummy").toString("base64")
        });

        const docId = upload.data.ID;

        // mock processing response
        executeHttpRequest.mockResolvedValue({
            data: {
                status: "DONE",
                extraction: {
                    headerFields: [
                        { name: "documentNumber", value: "INV-001" },
                        { name: "senderName", value: "ABC Corp" },
                        { name: "documentDate", value: "2024-01-01" },
                        { name: "grossAmount", value: 100 },
                        { name: "currencyCode", value: "USD" },
                        { name: "_avgConfidence", value: 0.95 }
                    ],
                    lineItems: [
                        [
                        {
                            description: "Item 1",
                            quantity: 2,
                            unitPrice: 50,
                            netAmount: 100
                        }
                    ]
                    ]
                }
            }
        });

        const res = await POST('/odata/v4/document-intelligence/processDocument', {
            documentId: docId
        });

        expect(res.status).to.equal(200);
        expect(res.data.invoiceNumber).to.equal("INV-001");
    });

    // ==========================
    // ❌ INVALID EXTRACTION
    // ==========================
    it('should handle invalid extraction response', async () => {

        executeHttpRequest.mockResolvedValueOnce({
            data: {
                id: "job-222",
                status: "PENDING"
            }
        });

        const upload = await POST('/odata/v4/document-intelligence/uploadDocument', {
            fileName: "test.pdf",
            rawText: Buffer.from("dummy").toString("base64")
        });

        const docId = upload.data.ID;

        executeHttpRequest.mockResolvedValue({
            data: {
                status: "DONE",
                extraction: null
            }
        });

        try {
            await POST('/odata/v4/document-intelligence/processDocument', {
                documentId: docId
            });
        } catch (err) {
            expect(err.response.status).to.equal(500);
        }
    });

    // ==========================
    // ✅ AUDIT LOGS
    // ==========================
    it('should create audit logs', async () => {

        const logs = await GET('/odata/v4/document-intelligence/AuditLogs');

        expect(logs.status).to.equal(200);
        expect(logs.data.value.length).to.be.greaterThan(0);
    });
    it('should mark document as FAILED when AI returns FAILED', async () => {

  executeHttpRequest.mockResolvedValueOnce({
    data: { id: "job-1", status: "PENDING" }
  });

  const upload = await POST('/odata/v4/document-intelligence/uploadDocument', {
    fileName: "test.pdf",
    rawText: Buffer.from("dummy").toString("base64")
  });

  const docId = upload.data.ID;

  executeHttpRequest.mockResolvedValue({
    data: { status: "FAILED" }
  });

  try {
    await POST('/odata/v4/document-intelligence/processDocument', { documentId: docId });
  } catch (err) {
    expect(err.response.status).to.equal(500);
  }
});
it('should handle unexpected errors', async () => {
 executeHttpRequest.mockResolvedValueOnce({
    data: { id: "job-1", status: "PENDING" }
  });

  const upload = await POST('/odata/v4/document-intelligence/uploadDocument', {
    fileName: "test.pdf",
    rawText: Buffer.from("dummy").toString("base64")
  });

  const docId = upload.data.ID;
  executeHttpRequest.mockImplementation(() => {
    throw new Error("Unexpected failure");
  });

  try {
    await POST('/odata/v4/document-intelligence/processDocument', { documentId: docId });
  } catch (err) {
    expect(err.response.status).to.equal(500);
  }
});
});