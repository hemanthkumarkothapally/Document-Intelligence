# 📄 CAP Document Intelligence Service (DIS)

> A SAP CAP (Cloud Application Programming Model) service that accepts PDF documents, uses **SAP Document Information Extraction (Doc AI)** to extract structured invoice fields, stores results in SAP HANA Cloud with a full audit trail, and exposes results via OData V4 for a UI5 Fiori Elements app.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Data Model](#data-model)
- [OData Service](#odata-service)
- [SAP Document AI Integration](#sap-document-ai-integration)
- [Extraction Flow](#extraction-flow)
- [Audit Trail](#audit-trail)
- [Error Handling](#error-handling)
- [Test Strategy](#test-strategy)
- [MTA Deployment](#mta-deployment)
- [Local Development Setup](#local-development-setup)
- [Known Limitations](#known-limitations)
- [Environment & Destination Configuration](#environment--destination-configuration)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      UI5 Fiori Elements App                          │
│        (List Report – Documents, Invoices, Line Items)               │
└─────────────────────────┬────────────────────────────────────────────┘
                          │ OData V4
┌─────────────────────────▼────────────────────────────────────────────┐
│                    CAP Node.js Service  (srv/)                       │
│                                                                      │
│  ┌──────────────────┐        ┌───────────────────────────────────┐   │
│  │ uploadDocument   │        │        processDocument            │   │
│  │   (Action)       │        │           (Action)                │   │
│  │                  │        │                                   │   │
│  │ 1. Parse PDF     │        │ 1. GET /document/jobs/{jobId}     │   │
│  │ 2. INSERT doc    │        │ 2. Poll until DONE / FAILED       │   │
│  │ 3. POST to       │        │ 3. Map header + line item fields  │   │
│  │    Doc AI        │        │ 4. INSERT ExtractedInvoice        │   │
│  │ 4. Store jobId   │        │ 5. INSERT LineItems               │   │
│  └──────────────────┘        │ 6. UPDATE Document status         │   │
│                              │ 7. Write AuditLog entries         │   │
│                              └───────────────────────────────────┘   │
│                                                                      │
│         before/after UPDATE hooks (Invoice + LineItem change audit)  │
└──────────────────────────────────────────────────────────────────────┘
                          │                        │
         ┌────────────────▼──────┐    ┌────────────▼──────────────┐
         │   SAP HANA Cloud      │    │  SAP Document Information  │
         │                       │    │  Extraction (Doc AI)       │
         │  Documents            │    │                            │
         │  ExtractedInvoices    │    │  Schema: SAP_invoice_schema│
         │  LineItems            │    │  Client: default           │
         │  AuditLogs            │    │  Destination: Doc_AI       │
         └───────────────────────┘    └────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **CAP Service** | Orchestrates upload, polling, persistence, and OData exposure |
| **pdf-parse** | Extracts raw text from the uploaded PDF buffer |
| **SAP Doc AI** | Performs structured field extraction using `SAP_invoice_schema` |
| **`@sap-cloud-sdk/http-client`** | Calls Doc AI REST API via BTP Destination (`Doc_AI`) |
| **HANA Cloud** | Persists all entities with ACID-compliant transactions |
| **UI5 Fiori Elements** | Consumes OData V4 to display and manage documents |
| **XSUAA** | Authentication and authorisation in production |

---

## Project Structure

```
cap-dis/
├── db/
│   └── schema.cds                  # Data model (namespace com.cy.DIS)
├── srv/
│   ├── document-service.cds        # OData service definition + actions
│   └── document-service.js         # Action handlers, hooks, Doc AI integration
├── app/
│   └── documents/
│       ├── webapp/
│       │   ├── manifest.json       # UI5 app descriptor
│       │   └── index.html
│       └── annotations.cds         # Fiori Elements annotations
├── test/
│   └── document-service.test.js    # Unit tests (@sap/cds/test + Jest)
├── mta.yaml                        # MTA deployment descriptor
├── package.json
└── README.md
```

---

## Data Model

Defined in `db/schema.cds` under namespace `com.cy.DIS`.

```cds
namespace com.cy.DIS;

using { cuid, managed } from '@sap/cds/common';

type Status : String enum {
    PENDING;
    DONE;
    FAILED;
}

entity Documents : cuid, managed {
    jobId      : String(100);            // Doc AI job ID returned on upload
    rawText    : LargeString @mandatory; // PDF text extracted by pdf-parse
    fileName   : String(255) @mandatory;
    uploadedBy : String(100);
    uploadedAt : Timestamp;
    status     : Status default 'PENDING';
    invoice    : Composition of one ExtractedInvoices
                     on invoice.document = $self;
    auditLogs  : Association to many AuditLogs
                     on auditLogs.document = $self;
}

entity ExtractedInvoices : cuid, managed {
    document      : Association to Documents @mandatory;
    invoiceNumber : String(100);
    vendorName    : String(255);
    invoiceDate   : Date;
    totalAmount   : Decimal(15, 2);
    currency      : String(3);
    confidence    : Decimal(4, 3);      // Average confidence across header fields
    lineItems     : Composition of many LineItems
                        on lineItems.invoice = $self;
}

entity LineItems : cuid {
    invoice     : Association to ExtractedInvoices @mandatory;
    description : String(500);
    quantity    : Decimal(10, 3);
    unitPrice   : Decimal(15, 2);
    lineTotal   : Decimal(15, 2);
}

entity AuditLogs : cuid, managed {
    document    : Association to Documents @mandatory;
    action      : String(50);
    performedBy : String(100);
    performedAt : Timestamp;
    details     : LargeString;          // JSON string with contextual metadata
}
```

### Key Design Decisions

**`Documents.jobId`** — Stores the Doc AI asynchronous job ID returned by `POST /document/jobs`. This decouples upload from extraction, enabling polling in `processDocument`.

**`Composition of one ExtractedInvoices`** — Enforces a strict one-to-one deep structure between a Document and its extracted invoice. Cascade operations are handled automatically by CAP.

**`confidence : Decimal(4,3)`** — Stores the average confidence score across all header fields returned by Doc AI (0.000–1.000), computed in `mapHeaderFields()`.

**`cuid, managed` mixins** — `cuid` auto-generates UUIDs; `managed` automatically adds `createdAt`, `createdBy`, `modifiedAt`, `modifiedBy` via CAP.

### Entity Relationships

```
Documents (1) ──Composition── (0..1) ExtractedInvoices (1) ──Composition── (0..*) LineItems
Documents (1) ──Association── (0..*) AuditLogs
```

---

## OData Service

Defined in `srv/document-service.cds`:

```cds
using com.cy.DIS as db from '../db/schema';

service DocumentService @(path: '/odata/v4/document') {

    entity Documents         as projection on db.Documents;
    entity ExtractedInvoices as projection on db.ExtractedInvoices;
    entity LineItems         as projection on db.LineItems;
    entity AuditLogs         as projection on db.AuditLogs  @readonly;

    action uploadDocument(
        rawText  : LargeString,   // base64-encoded PDF content
        fileName : String
    ) returns Documents;

    action processDocument(
        documentId : UUID
    ) returns ExtractedInvoices;
}
```

### Available Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| `POST` | `/odata/v4/document/uploadDocument` | Upload base64 PDF, create Document + Doc AI job |
| `POST` | `/odata/v4/document/processDocument` | Poll Doc AI job, persist extraction results |
| `GET` | `/odata/v4/document/Documents` | List all documents |
| `GET` | `/odata/v4/document/Documents(ID)?$expand=invoice($expand=lineItems)` | Document with full invoice detail |
| `PATCH` | `/odata/v4/document/ExtractedInvoices(ID)` | Update invoice fields (change-audited) |
| `PATCH` | `/odata/v4/document/LineItems(ID)` | Update line items (change-audited) |
| `GET` | `/odata/v4/document/AuditLogs` | Read-only audit trail |

---

## SAP Document AI Integration

The service integrates with **SAP Document Information Extraction** (part of SAP AI Business Services) via the BTP Destination `Doc_AI`.

### Schema Used

```
schemaName : SAP_invoice_schema   (built-in SAP schema for standard invoices)
clientId   : default
```

The `SAP_invoice_schema` automatically extracts the following **header fields**:

| Doc AI Field Name | Mapped To | Entity Field |
|-------------------|-----------|--------------|
| `documentNumber` | Invoice number | `ExtractedInvoices.invoiceNumber` |
| `senderName` | Vendor name | `ExtractedInvoices.vendorName` |
| `documentDate` | Invoice date | `ExtractedInvoices.invoiceDate` |
| `grossAmount` | Total amount | `ExtractedInvoices.totalAmount` |
| `currencyCode` | Currency | `ExtractedInvoices.currency` |

And the following **line item fields**:

| Doc AI Field Name | Mapped To | Entity Field |
|-------------------|-----------|--------------|
| `description` | Item description | `LineItems.description` |
| `quantity` | Quantity | `LineItems.quantity` |
| `unitPrice` | Unit price | `LineItems.unitPrice` |
| `netAmount` | Line total | `LineItems.lineTotal` |

### Field Mapping Implementation

Doc AI returns fields as flat arrays of `{ name, value, confidence }` objects. Two helper functions normalise these into keyed objects:

```js
// Maps flat array of { name, value, confidence } → keyed object
// Also computes average confidence across all header fields
function mapHeaderFields(headerFields) {
    const obj = {};
    let totalConfidence = 0;
    for (const field of headerFields) {
        obj[field.name] = field.value;
        totalConfidence += field.confidence || 0;
    }
    obj._avgConfidence = headerFields.length
        ? totalConfidence / headerFields.length
        : 0;
    return obj;
}

// Each line item in Doc AI is itself an array of { name, value } fields
function mapLineItems(lineItems) {
    return lineItems.map(itemArray => {
        const obj = {};
        for (const field of itemArray) {
            obj[field.name] = field.value;
        }
        return obj;
    });
}
```

---

## Extraction Flow

### Phase 1 — `uploadDocument`

```
Client sends { rawText: "<base64 PDF>", fileName: "invoice.pdf" }
        │
        ▼
Buffer.from(rawText, 'base64') → pdf-parse → extractedText
        │
        ▼
INSERT Documents { status: 'PENDING', rawText, fileName, uploadedBy, uploadedAt }
        │
        ▼
FormData { file: <PDF buffer>, options: { schemaName, clientId } }
POST /document/jobs  (via executeHttpRequest + Destination Doc_AI)
        │
        ▼
Response: { id: "<jobId>" }
UPDATE Documents SET jobId = '<jobId>'
AuditLog: UPLOADED  { message, jobId }
        │
        ▼
Return Document record
```

### Phase 2 — `processDocument`

```
Caller provides { documentId: "<UUID>" }
        │
        ▼
SELECT Document, validate jobId exists
AuditLog: PROCESS_STARTED  { jobId }
        │
        ▼
Poll loop (max 10 attempts, 3 000 ms delay):
  GET /document/jobs/{jobId}
        │
        ├── status === "DONE"
        │       │
        │       ▼
        │   mapHeaderFields(extraction.headerFields)
        │   mapLineItems(extraction.lineItems)
        │   INSERT ExtractedInvoices
        │   INSERT LineItems (batch)
        │   UPDATE Documents.status = 'DONE'
        │   AuditLog: EXTRACTION_SAVED  { invoiceId, totalLineItems }
        │   AuditLog: PROCESS_SUCCESS   { invoiceId, items }
        │   Return ExtractedInvoice record
        │
        ├── status === "FAILED"
        │       │
        │       ▼
        │   UPDATE Documents.status = 'FAILED'
        │   AuditLog: PROCESS_FAILED
        │   Throw error
        │
        └── status === "PENDING" / "RUNNING"
                │
                ▼
            await delay(3000) → retry
                │
            After 10 retries →
            AuditLog: PROCESS_TIMEOUT
            Return { message: "Still processing" }
```

---

## Audit Trail

Every significant operation writes an `AuditLog` entry via the `logAudit()` helper. The helper is intentionally wrapped in its own `try/catch` so audit failures never break the main request flow.

```js
async function logAudit(documentId, action, req, detailsObj) {
    try {
        await INSERT.into(AuditLogs).entries({
            document_ID: documentId,
            action,
            performedBy: req.user?.id || 'system',
            performedAt: new Date(),
            details: typeof detailsObj === "string"
                ? detailsObj
                : JSON.stringify(detailsObj)
        });
    } catch (err) {
        console.warn("Audit log failed:", err);
    }
}
```

### Complete AuditLog Action Reference

| Action | Trigger | Details Payload |
|--------|---------|-----------------|
| `UPLOADED` | Doc AI job created successfully | `{ message, jobId }` |
| `UPLOAD_FAILED` | Doc AI POST failed or no jobId returned | Error message string |
| `PDF_PARSE_FAILED` | `pdf-parse` threw an error | Error message string |
| `PROCESS_STARTED` | `processDocument` invoked | `{ jobId }` |
| `EXTRACTION_SAVED` | Invoice + line items inserted | `{ invoiceId, totalLineItems }` |
| `PROCESS_SUCCESS` | Document status set to DONE | `{ invoiceId, items }` |
| `PROCESS_FAILED` | Doc AI job status = FAILED | Full Doc AI result object |
| `EXTRACTION_FAILED` | Doc AI DONE but no extraction data | `"No data"` |
| `PROCESS_TIMEOUT` | 10 poll attempts exhausted | `{}` |
| `PROCESS_ERROR` | Unexpected exception in processDocument | Error message string |
| `INVOICE_UPDATED` | User patched ExtractedInvoice field(s) | `{ entity, changes: [{ field, old, new }] }` |
| `INVOICE_AUDIT_FAILED` | Error in after-UPDATE invoice hook | `{ error }` |
| `LINEITEM_UPDATED` | User patched LineItem field(s) | `{ entity, changes: [{ field, old, new }] }` |
| `LINEITEM_AUDIT_FAILED` | Error in after-UPDATE line item hook | `{ error }` |

### Change Detection — before/after UPDATE Hooks

The service captures field-level diffs when users manually correct extracted data in the UI:

```
before UPDATE ExtractedInvoices  →  snapshots current DB row into req._oldData
after  UPDATE ExtractedInvoices  →  diffs { invoiceNumber, vendorName,
                                            invoiceDate, totalAmount, currency }
                                    writes INVOICE_UPDATED if any field changed

before UPDATE LineItems          →  snapshots current DB row into req._oldData
after  UPDATE LineItems          →  diffs { description, quantity, unitPrice, lineTotal }
                                    resolves document_ID via parent ExtractedInvoice
                                    writes LINEITEM_UPDATED if any field changed
```

This ensures every correction made by a user through the UI5 app is fully traceable with old and new values recorded.

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Missing `rawText` or `fileName` | Returns HTTP 400 immediately |
| `pdf-parse` throws | Logs `PDF_PARSE_FAILED`, continues (rawText set to empty string) |
| Doc AI POST fails | Logs `UPLOAD_FAILED`, returns HTTP 500 |
| Doc AI returns no `jobId` | Logs `UPLOAD_FAILED`, returns HTTP 500 |
| `documentId` not found | Returns HTTP 404 |
| Document has no `jobId` | Returns HTTP 400 |
| Doc AI job status = `FAILED` | Updates status to `FAILED`, logs `PROCESS_FAILED`, throws |
| Doc AI returns `DONE` but no `extraction` | Updates status to `FAILED`, logs `EXTRACTION_FAILED` |
| Poll timeout (10 × 3 s) | Logs `PROCESS_TIMEOUT`, returns `{ message: "Still processing" }` |
| Unexpected exception | Logs `PROCESS_ERROR`, returns HTTP 500 |
| `after UPDATE` hook error | Logs `INVOICE/LINEITEM_AUDIT_FAILED`, does not affect PATCH response |
| `logAudit()` itself fails | `console.warn` only — never propagates to caller |

---

## Test Strategy

Tests are in `test/document-service.test.js` using `@sap/cds/test` (Jest-based), running against an in-memory SQLite database — no HANA Cloud or Doc AI connection required.

### Mocking Strategy

**SAP Cloud SDK** is mocked at the module level to intercept all Doc AI HTTP calls:

```js
jest.mock('@sap-cloud-sdk/http-client', () => ({
    executeHttpRequest: jest.fn()
}));
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
```

**pdf-parse** is mocked to return predictable text without needing a real PDF:

```js
jest.mock('pdf-parse/lib/pdf-parse.js', () =>
    jest.fn().mockResolvedValue({ text: 'Mocked invoice text content' })
);
```

Each test configures `executeHttpRequest.mockResolvedValueOnce(...)` to return the exact Doc AI response shape needed for that scenario.

### Test Cases

#### Test 1 — uploadDocument creates a Document with status PENDING

```
GIVEN  a base64-encoded payload and a fileName
AND    executeHttpRequest returns { data: { id: "job-001" } }
WHEN   POST /odata/v4/document/uploadDocument is called
THEN   a Document record exists in the database
AND    Document.status === 'PENDING'
AND    Document.jobId === 'job-001'
AND    an AuditLog entry with action 'UPLOADED' exists
```

#### Test 2 — processDocument creates ExtractedInvoice with correct fields

```
GIVEN  a Document with jobId = 'job-001'
AND    executeHttpRequest returns { data: { status: "DONE", extraction: { headerFields, lineItems } } }
WHEN   POST /odata/v4/document/processDocument is called
THEN   an ExtractedInvoice record exists with correctly mapped field values
AND    the expected number of LineItems are persisted
AND    Document.status === 'DONE'
AND    AuditLog entries exist for PROCESS_STARTED, EXTRACTION_SAVED, PROCESS_SUCCESS
```

#### Test 3 — Doc AI FAILED status sets Document to FAILED

```
GIVEN  a Document with a valid jobId
AND    executeHttpRequest returns { data: { status: "FAILED" } }
WHEN   POST /odata/v4/document/processDocument is called
THEN   no ExtractedInvoice record is created
AND    Document.status === 'FAILED'
AND    an AuditLog entry with action 'PROCESS_FAILED' exists
AND    the action returns an error response (does not throw unhandled)
```

#### Test 4 — AuditLog is created on every processDocument call

```
GIVEN  any processDocument call (success or failure)
WHEN   the action completes
THEN   at least one AuditLog entry exists for the documentId
AND    AuditLog.performedBy matches req.user.id
AND    AuditLog.details is a valid JSON string
```

### Running Tests

```bash
npm test
```

Expected output:

```
 PASS  test/document-service.test.js
  DocumentService
    ✓ uploadDocument creates a Document with status PENDING (130ms)
    ✓ processDocument creates ExtractedInvoice with correct fields (105ms)
    ✓ Doc AI FAILED status sets Document to FAILED (88ms)
    ✓ AuditLog is created on every processDocument call (97ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

---

## MTA Deployment

### Prerequisites

- SAP BTP account with HANA Cloud instance provisioned
- SAP Document Information Extraction service instance and key created
- BTP Destination `Doc_AI` configured (see [Environment & Destination Configuration](#environment--destination-configuration))
- `cf` CLI authenticated: `cf login`
- MTA Build Tool installed: `npm install -g mbt`

### Add production resources

```bash
cds add hana,mta,xsuaa --for production
```

### Build and deploy

```bash
mbt build
cf deploy mta_archives/cap-dis_1.0.0.mtar
```

### MTA Resources

| Resource | Type | Purpose |
|----------|------|---------|
| `dis-hana` | `com.sap.xs.hdi-container` | HANA Cloud HDI schema for all entities |
| `dis-xsuaa` | `com.sap.xs.uaa` | Authentication + authorisation |
| `dis-destination` | `org.cloudfoundry.managed-service` | BTP Destination service hosting `Doc_AI` |

---

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run locally (SQLite in-memory)

```bash
cds watch
```

Service starts at `http://localhost:4004`. Uses SQLite — no HANA needed locally.

### 3. Upload a PDF document

```bash
BASE64=$(base64 -w 0 sample-invoice.pdf)

curl -X POST http://localhost:4004/odata/v4/document/uploadDocument \
  -H "Content-Type: application/json" \
  -d "{\"rawText\": \"$BASE64\", \"fileName\": \"sample-invoice.pdf\"}"
```

### 4. Process the document

```bash
curl -X POST http://localhost:4004/odata/v4/document/processDocument \
  -H "Content-Type: application/json" \
  -d '{ "documentId": "<ID from step 3>" }'
```

### 5. View extracted invoice with line items

```
GET http://localhost:4004/odata/v4/document/Documents
    ?$expand=invoice($expand=lineItems)
```

---

## Environment & Destination Configuration

### BTP Destination: `Doc_AI`

Configure in SAP BTP Cockpit → Connectivity → Destinations:

| Property | Value |
|----------|-------|
| Name | `Doc_AI` |
| Type | `HTTP` |
| URL | `https://aiservices-trial.cfapps.<region>.hana.ondemand.com/api/v1` |
| Authentication | `OAuth2ClientCredentials` |
| Client ID | *(from Doc AI service key — `uaa.clientid`)* |
| Client Secret | *(from Doc AI service key — `uaa.clientsecret`)* |
| Token Service URL | *(from Doc AI service key — `uaa.url`)/oauth/token* |

Add the additional property:

| Additional Property | Value |
|--------------------|-------|
| `HTML5.DynamicDestination` | `true` |

---

## Known Limitations

### 1. Synchronous Polling
`processDocument` polls Doc AI up to 10 times (3-second delay each, max ~30 seconds) within a single OData request. For production workloads with large PDFs this risks HTTP gateway timeouts. Mitigation: replace with an async job queue using the SAP BTP Job Scheduling Service.

### 2. Single Schema Support
The service is hardcoded to `SAP_invoice_schema`. Documents that are not standard invoices (purchase orders, delivery notes, receipts) will return partially matched or empty fields. Mitigation: add a `schemaName` parameter to the `uploadDocument` action and pass it through.

### 3. PDF-Only Input
The upload handler always runs `pdf-parse` on the incoming buffer. Non-PDF inputs (images, Word documents) will cause `pdf-parse` to fail silently, and `rawText` will be empty. Doc AI still processes the original binary, but the stored `rawText` will not reflect the document. Mitigation: add MIME type detection and skip `pdf-parse` for non-PDF types.

### 4. No Retry on Transient Network Errors
If `executeHttpRequest` fails during polling due to a transient network error, the entire `processDocument` call fails and the document is marked `FAILED`. The caller must manually re-invoke `processDocument`. Mitigation: add exponential backoff retry logic around the `executeHttpRequest` call inside the poll loop.

### 5. Line Item Field Name Coupling
`mapLineItems()` relies on Doc AI returning exact field names (`description`, `quantity`, `unitPrice`, `netAmount`) as defined in `SAP_invoice_schema`. A custom schema with different field names will silently produce `undefined` values in the inserted `LineItems`. Mitigation: introduce a configurable field-name mapping object per schema.

### 6. Averaged Confidence Score
`ExtractedInvoices.confidence` is the arithmetic mean across all header field confidence values. A document where most fields are high-confidence but one critical field (e.g., `grossAmount`) is low-confidence will still show an inflated average score. Mitigation: store per-field confidence or use the minimum confidence value to represent the weakest extraction link.

### 7. Potential Null document_ID in AuditLog
In `uploadDocument`, if the INSERT into Documents succeeds but a subsequent error occurs inside the outer `try/catch`, the `ID` variable may be out of scope, logging an audit entry with `document_ID = null`. Mitigation: declare `let ID;` before the outer `try` block.

### 8. No Deduplication on Reprocessing
Calling `processDocument` on a document that is already `DONE` will insert a second `ExtractedInvoice` record. The one-to-one `Composition` in the schema does not enforce a DB-level unique constraint. Mitigation: add a guard clause checking `doc.status === 'DONE'` before polling and return the existing invoice.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | SAP CAP (Node.js, CDS) |
| Database | SAP HANA Cloud |
| AI Extraction | SAP Document Information Extraction (Doc AI) |
| PDF Parsing | `pdf-parse` |
| BTP Connectivity | `@sap-cloud-sdk/http-client` + Destination `Doc_AI` |
| Multipart Upload | `form-data` |
| OData Version | OData V4 |
| Frontend | SAP UI5 Fiori Elements (List Report + Object Page) |
| Authentication | SAP XSUAA |
| Testing | `@sap/cds/test` + Jest |
| Deployment | SAP BTP Cloud Foundry (MTA via `mbt`) |