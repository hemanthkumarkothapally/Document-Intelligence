const cds = require('@sap/cds');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const FormData = require('form-data');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

module.exports = cds.service.impl(function () {
  const { Documents, ExtractedInvoices, LineItems, AuditLogs } = this.entities;
  this.on('uploadDocument', async (req) => {
    try {
      const { rawText, fileName } = req.data;
      if (!rawText || !fileName) {
        req.error(400, "File content or filename missing");
      }
      const buffer = Buffer.from(rawText, 'base64');
      let extractedText;
      try {
        const data = await pdfParse(buffer);
        extractedText = data.text || "";
      } catch (err) {
        console.warn("PDF parsing failed, continuing...", err.message);
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
      const doc = await SELECT.one.from(Documents).where({ ID });
      console.log("inserteddocument", doc);
      let jobId = null;
      let status = 'PENDING';
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
        console.error("Document AI call failed:", err.message);

        await INSERT.into(AuditLogs).entries({
          document_ID: doc.ID,
          action: 'UPLOAD_FAILED',
          performedBy: req.user.id,
          performedAt: new Date(),
          details: err.message
        });
        status = "FAILED";
        req.error(500, "Document AI upload failed");
      }
      console.log("uploadResponse", uploadResponse?.data?.id)
      jobId = uploadResponse?.data?.id;
      status = uploadResponse?.data?.status || 'PENDING';

      if (!jobId) {
        req.error(500, "Invalid response from Document AI");
      }
      console.log("Job Created:", jobId);
      await UPDATE(Documents)
        .set({
          jobId,
          status
        })
        .where({ ID: doc.ID });

      await INSERT.into(AuditLogs).entries({
        document_ID: doc.ID,
        action: 'UPLOADED',
        performedBy: req.user.id,
        performedAt: new Date(),
        details: 'Document uploaded to SAP Document AI'
      });
      return await SELECT.one.from(Documents).where({ ID: doc.ID });
    } catch (err) {

      console.error("❌ Upload Error:", err);

      req.error(500, err.message || "Unexpected error during upload");
    }
  });

  this.on('processDocument', async (req) => {
    const { documentId } = req.data;
    const doc = await SELECT.one.from(Documents).where({ ID: documentId });
    if (!doc) req.error(404, "Document not found");
    if (!doc.jobId) {
      req.error(400, "Document not sent to Document AI");
    }
    let result;
    let jobStatus;
    if (doc.status === "PENDING") {
      const maxRetries = 10;
      const delay = (ms) => new Promise(res => setTimeout(res, ms));
      jobStatus = "PENDING";
      try {
        for (let i = 0; i < maxRetries; i++) {
          const jobResponse = await executeHttpRequest(
            { destinationName: "Doc_AI" },
            {
              method: "GET",
              url: `/document/jobs/${doc.jobId}`
            }
          );
          result = jobResponse.data;
          jobStatus = result.status;
          console.log(`Attempt ${i + 1}: ${jobStatus}`);
          if (jobStatus === "DONE") {
            const extraction = result.extraction;
            if (!extraction) {
              req.error(500, "No extraction data found");
            }
            const header = mapHeaderFields(result.extraction.headerFields);
            const lineItems = mapLineItems(result.extraction.lineItems);
            const ID = cds.utils.uuid();
            const invoiceData = {
              ID,
              document_ID: documentId,
              invoiceNumber: header.documentNumber || null,
              vendorName: header.senderName || null,
              invoiceDate: header.documentDate || null,
              totalAmount: header.grossAmount ?? header.netAmount ?? null,
              currency: header.currencyCode || null,
              confidence: header._avgConfidence || null
            };
            const invoice = await INSERT.into(ExtractedInvoices).entries(invoiceData);
            const lineItemsData = lineItems.map(item => ({
              invoice_ID: ID,
              description: item.description || null,
              quantity: item.quantity || null,
              unitPrice: item.unitPrice || null,
              lineTotal: item.netAmount || null
            }));
            await INSERT.into(LineItems).entries(lineItemsData)
            await UPDATE(Documents)
              .set({ status: "DONE" })
              .where({ ID: documentId });
            return await SELECT.one.from(ExtractedInvoices).where({ ID: invoice.ID });
          }
          if (jobStatus === "FAILED") {
            await UPDATE(Documents)
              .set({ status: "FAILED" })
              .where({ ID: documentId });
            req.error(500, "Document AI processing failed");
          }
          await delay(3000);
        }
        await UPDATE(Documents)
          .set({ status: "PENDING" })
          .where({ ID: documentId });

        return {
          message: "Processing still in progress"
        };

      } catch (err) {
        console.error("❌ Processing Error:", err.message);
        await UPDATE(Documents)
          .set({ status: "FAILED" })
          .where({ ID: documentId });
        req.error(500, err.message);
      }
    }
  });
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