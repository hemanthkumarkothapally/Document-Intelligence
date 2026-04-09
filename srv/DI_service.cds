using {com.cy.DIS as DIS} from '../db/schema';

service DocumentIntelligence {
    // @odata.draft.enabled
    entity Documents         as projection on DIS.Documents;
    entity ExtractedInvoices as projection on DIS.ExtractedInvoices;
    entity LineItems         as projection on DIS.LineItems;
    entity AuditLogs         as projection on DIS.AuditLogs;
    action processDocument(documentId : UUID) returns ExtractedInvoices;
    action uploadDocument(
        rawText : LargeString,
        fileName : String
    ) returns Documents;
}
