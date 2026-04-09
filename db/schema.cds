namespace com.cy.DIS;

using {
    cuid,
    managed
} from '@sap/cds/common';

type Status : String enum {
    PENDING;
    DONE;
    FAILED;
}

// @changelog
entity Documents : cuid, managed {
    // content   : LargeBinary;
    //     @Core.MediaType: 'application/pdf'
    //     @Core.ContentDisposition.Filename: fileName;
    jobId      : String(100);
    rawText    : LargeString @mandatory;
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
    confidence    : Decimal(4, 3);
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
    details     : LargeString;
}
