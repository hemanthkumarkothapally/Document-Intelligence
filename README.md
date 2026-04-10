# 📄 Document Intelligence Service

### SAP CAP | SAP Document AI | SAP UI5

![SAP CAP]
![Node.js]
![HANA]
![UI5]
![Tests]
![Status]

---

## 🚀 Overview

A full-stack **Document Intelligence application** built using **SAP CAP + SAP Document AI**, enabling:

* 📥 Upload of invoice PDFs
* 🤖 AI-based data extraction
* 🧾 Structured storage in HANA
* 📊 UI visualization & editing
* 📜 Complete audit trail
* 🧪 Automated unit testing

---

## 🏗️ Architecture

```
SAP UI5 (Frontend)
        ↓
CAP Service (Node.js)
        ↓
SAP Document AI
        ↓
SAP HANA Database
```

---

## 📸 Screenshots (Add Yours)

> 👉 Add screenshots here later

```
/docs/screenshots/list.png
/docs/screenshots/objectpage.png
/docs/screenshots/upload.png
```

---

## 📦 Data Model

### 📄 Documents

* Stores uploaded files
* Tracks processing lifecycle

### 🧾 ExtractedInvoices

* Stores invoice header data

### 📦 LineItems

* Stores item-level details

### 📜 AuditLogs

* Tracks all system events

---

## ⚙️ Core Features

### 📥 Upload Flow

* Upload PDF (Base64)
* Extract text (`pdf-parse`)
* Send to SAP Document AI
* Store jobId + status

---

### 🤖 AI Processing Flow

1. Upload document
2. Create AI job
3. Poll status
4. If **DONE**:

   * Extract data
   * Save invoice + line items
   * Update status
5. If **FAILED**:

   * Mark document failed

---

## 📊 Audit Logging

Audit logs are created for:

* Upload events
* Processing lifecycle
* Extraction success/failure
* Invoice updates
* Line item updates
* Errors

### Example

```json
{
  "action": "INVOICE_UPDATED",
  "details": {
    "field": "invoiceNumber",
    "old": "174206",
    "new": "174205"
  }
}
```

---

## 🧠 Technical Highlights

### 🔹 Robust Error Handling

* Uses `throw req.error()`
* Prevents inconsistent DB state
* Logs all failures

---

### 🔹 Retry Mechanism

* Polls AI service with retries
* Handles async processing safely

---

### 🔹 Clean Architecture

* Separation of:

  * Upload
  * Processing
  * Mapping
  * Logging

---

### 🔹 Centralized Audit Logging

```js
logAudit(documentId, action, req, details)
```

---

## 🔗 API Endpoints

### 📥 Upload Document

```
POST /uploadDocument
```

**Payload:**

```json
{
  "fileName": "invoice.pdf",
  "rawText": "base64string"
}
```

---

### 🤖 Process Document

```
POST /processDocument
```

**Payload:**

```json
{
  "documentId": "UUID"
}
```

---

### 📄 Get Documents

```
GET /Documents
```

---

## 🧪 Testing

### 🔧 Stack

* @sap/cds/test
* Jest
* Chai

---

### ✅ Test Coverage

* Upload success & failure
* AI processing
* Invalid responses
* Missing jobId
* Audit logs
* Error scenarios

---

### 📊 Coverage Report

```
Statements: ~60%
Branches:   ~45%
Functions:  ~50%
```

---

### 🔌 Mocking

* Document AI → mocked
* PDF parsing → mocked

```js
jest.mock('@sap-cloud-sdk/http-client');
jest.mock('pdf-parse');
```

---

## 🖥️ UI (SAP UI5)

### 📋 List Page

* Documents table
* Upload button
* Delete functionality

### 📄 Object Page

* Invoice details
* Line items (editable)
* Audit logs

### ✏️ Editing Logic

* View mode → Text
* Edit mode → Input fields
* Save + Cancel support

---

## 🚀 Deployment

* SAP BTP (Cloud Foundry)
* HANA HDI container
* XSUAA authentication
* Destination: SAP Document AI

---

## ⚠️ Error Handling Strategy

* Fail fast
* Always log audit
* Always update status
* Avoid partial writes

---

## 📈 Future Enhancements

* 🔄 Background job queue (no polling)
* 📊 Dashboard analytics
* 🔐 Role-based access
* 📁 Multi-document support
* 📉 Confidence validation UI

---

## 👨‍💻 Project Highlights

This project demonstrates:

✔ SAP CAP end-to-end development
✔ SAP AI service integration
✔ Clean backend architecture
✔ Enterprise-grade audit logging
✔ UI5 custom development
✔ Unit testing strategy

---

## 📌 Final Note

This is a **production-style implementation** of a Document Intelligence system combining:

👉 AI + Backend + UI + Testing + Audit


