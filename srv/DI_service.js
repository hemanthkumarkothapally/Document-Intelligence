const cds = require('@sap/cds');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const FormData = require('form-data');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(function () {
  const { Documents, ExtractedInvoices, LineItems, AuditLogs } = this.entities;
  this.before('UPDATE', 'ExtractedInvoices', async (req) => {
    const { ID } = req.data;
    const oldData = await SELECT.one.from(ExtractedInvoices)
      .where({ ID })
      .columns(
        '*',
        { lineItems: ['*'] }
      );
    req._oldData = oldData;
  });


  this.after('UPDATE', 'ExtractedInvoices', async (data, req) => {
    try {
      const oldData = req._oldData;
      if (!oldData) return;
      const newData = {
        ...oldData,
        ...data
      };
      console.log(newData)
      console.log(oldData)
      const invoiceChanges = [];
      const fields = [
        "invoiceNumber",
        "vendorName",
        "invoiceDate",
        "totalAmount",
        "currency"
      ];

      fields.forEach(field => {
        if (oldData[field] !== newData[field]) {
          invoiceChanges.push({
            field,
            old: oldData[field],
            new: newData[field]
          });
        }
      });
      if (invoiceChanges.length > 0) {
        await logAudit(newData.document_ID, "INVOICE_UPDATED", req, {
          entity: "Invoice",
          changes: invoiceChanges
        });
      }
    } catch (err) {
      console.error("Invoice Audit Error:", err);
    }

  });
  this.before('UPDATE', 'LineItems', async (req) => {
    const { ID } = req.data;
    if (!ID) return;
    const oldData = await SELECT.one.from(LineItems).where({ ID });
    console.log("old line", oldData);
    req._oldData = oldData;
  });
  this.after('UPDATE', 'LineItems', async (data, req) => {
    try {
      const oldData = req._oldData;
      if (!oldData) return;
      const newData = {
        ...oldData,
        ...data
      };
      const lineItemChanges = [];
      ["description", "quantity", "unitPrice", "lineTotal"].forEach(field => {
        if (oldData[field] !== newData[field]) {
          lineItemChanges.push({
            field,
            old: oldData[field],
            new: newData[field],
            // itemId: newData.ID
          });
        }
      });

      if (lineItemChanges.length === 0) return;
      const invoice = await SELECT.one.from('com.cy.DIS.ExtractedInvoices')
        .where({ ID: newData.invoice_ID });

      await logAudit(invoice.document_ID, "LINEITEM_UPDATED", req, {
        entity: "LineItem",
        changes: lineItemChanges
      });

    } catch (err) {
      console.error("LineItem Audit Error:", err);
    }

  });
  this.on('uploadDocument', async (req) => {
    try {
      const { rawText, fileName } = req.data;
      if (!rawText || !fileName) {
       return req.error(400, "File content or filename missing");
      }
      const buffer = Buffer.from(rawText, 'base64');
      let extractedText;
      try {
        const data = await pdfParse(buffer);
        extractedText = data.text || "";
      } catch (err) {
        await logAudit(null, "PDF_PARSE_FAILED", req, err.message);
        console.log("PDF parsing failed, continuing...", err.message);
      }
      const ID = cds.utils.uuid();
      await INSERT.into(Documents).entries({
        ID,
        fileName,
        rawText: extractedText,
        status: 'PENDING',
        uploadedBy: req.user.id,
        uploadedAt: new Date()
      });
      const form = new FormData();
      form.append("file", buffer, {
        filename: fileName || "document.pdf",
        contentType: "application/pdf"
      });

      form.append("options", JSON.stringify({
        schemaName: "SAP_invoice_schema",
        clientId: "default"
      }));

      let uploadResponse;
      try {
        uploadResponse = await executeHttpRequest(
          { destinationName: "Doc_AI" },
          {
            method: "POST",
            url: "/document/jobs",
            headers: form.getHeaders(),
            data: form
          }
        );
      } catch (err) {
        await logAudit(ID, "UPLOAD_FAILED", req, err.message);
        return req.error(500, "Document AI upload failed");
      }
      console.log("uploadResponse", uploadResponse?.data?.id)
      const jobId = uploadResponse?.data?.id;

      if (!jobId) {
        await logAudit(ID, "UPLOAD_FAILED", req, "No Job ID");
        return req.error(500, "Invalid response from Document AI");
      }
      console.log("Job Created:", jobId);
      await UPDATE(Documents)
        .set({ jobId })
        .where({ ID });
      await logAudit(ID, "UPLOADED", req, {
        message: "Uploaded successfully to Doc Ai",
        jobId
      });
      return await SELECT.one.from(Documents).where({ ID });
    } catch (err) {
      await UPDATE(Documents)
        .set({ status: "FAILED" })
        .where({ ID });
      await logAudit(ID, "UPLOAD_FAILED", req, err.message);
      return req.error(500, "Document upload failed");
    }
  });

  this.on('processDocument', async (req) => {
    const { documentId } = req.data;
    const doc = await SELECT.one.from(Documents).where({ ID: documentId });
    if (!doc) return req.error(404, "Document not found");
    if (!doc.jobId) {
      return req.error(400, "Document not sent to Document AI");
    }
    await logAudit(documentId, "PROCESS_STARTED", req, {
      jobId: doc.jobId
    });
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    try {
      for (let i = 0; i < 10; i++) {

        const res = await executeHttpRequest(
          { destinationName: "Doc_AI" },
          { method: "GET", url: `/document/jobs/${doc.jobId}` }
        );

        const result = res.data;

        // await logAudit(documentId, "PROCESS_POLL", req, {
        //   attempt: i + 1,
        //   status: result.status
        // });

        if (result.status === "DONE") {

          const extraction = result.extraction;

          if (!extraction) {
            await UPDATE(Documents)
              .set({ status: "FAILED" })
              .where({ ID: documentId });
            await logAudit(documentId, "EXTRACTION_FAILED", req, "No data");
            return req.error(500, "Invalid AI response");
          }

          const header = mapHeaderFields(extraction.headerFields);
          const lineItems = mapLineItems(extraction.lineItems);

          const invoiceId = cds.utils.uuid();

          await INSERT.into(ExtractedInvoices).entries({
            ID: invoiceId,
            document_ID: documentId,
            invoiceNumber: header.documentNumber,
            vendorName: header.senderName,
            invoiceDate: header.documentDate,
            totalAmount: header.grossAmount,
            currency: header.currencyCode,
            confidence: header._avgConfidence
          });

          await INSERT.into(LineItems).entries(
            lineItems.map(i => ({
              invoice_ID: invoiceId,
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              lineTotal: i.netAmount
            }))
          );
          await logAudit(documentId, "EXTRACTION_SAVED", req, {
            invoiceId,
            totalLineItems: lineItems.length
          });
          await UPDATE(Documents)
            .set({ status: "DONE" })
            .where({ ID: documentId });

          await logAudit(documentId, "PROCESS_SUCCESS", req, {
            invoiceId,
            items: lineItems.length
          });

          return;
        }

        if (result.status === "FAILED") {
          await UPDATE(Documents)
            .set({ status: "FAILED" })
            .where({ ID: documentId });
          await logAudit(documentId, "PROCESS_FAILED", req, result);
          req.error(500, "AI failed");
        }

        await delay(3000);
      }

      await logAudit(documentId, "PROCESS_TIMEOUT", req, {});
      return { message: "Still processing" };
    } catch (error) {
      await logAudit(documentId, "PROCESS_ERROR", req, error.message);
      return req.error(500, error.message);
    }

  });
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
      console.error("Audit log failed:", err);
    }
  }
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
  };
  function mapLineItems(lineItems) {
    return lineItems.map(itemArray => {
      const obj = {};

      for (const field of itemArray) {
        obj[field.name] = field.value;
      }

      return obj;
    });
  }

});