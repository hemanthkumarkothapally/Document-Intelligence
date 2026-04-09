using DocumentIntelligence as service from '../../srv/DI_service';
annotate service.Documents with @(
   
    UI.FieldGroup #GeneralInfo: {
        $Type: 'UI.FieldGroupType',
        
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Raw Text',
                Value: rawText
            },
            {
                $Type: 'UI.DataField',
                Label: 'File Name',
                Value: fileName,
            },
            {
                $Type: 'UI.DataField',
                Label: 'Uploaded By',
                Value: uploadedBy
            },
            {
                $Type: 'UI.DataField',
                Label: 'Uploaded At',
                Value: uploadedAt
            },
            {
                $Type: 'UI.DataField',
                Label: 'Status',
                Value: status
            },
            {Value: content}
        ]
    },

    UI.Facets                 : [
        {
            $Type : 'UI.ReferenceFacet',
            Label : 'General Information',
            Target: '@UI.FieldGroup#GeneralInfo'
        },
        {
                    $Type : 'UI.ReferenceFacet',
                    Label : 'Invoice Details',
                    Target: 'invoice/@UI.FieldGroup#Invoicedetails'
                },
                {
                    $Type : 'UI.ReferenceFacet',
                    Label : 'Line Items',
                    Target: 'invoice/lineItems/@UI.LineItem#LineItems'
                },
                {
                    $Type : 'UI.ReferenceFacet',
                    Label: 'Audit Logs',
                    Target : 'auditLogs/@UI.LineItem#AuditLogs',
                }
         
    ],

    UI.LineItem               : [
        {
            $Type: 'UI.DataField',
            Value: rawText
        },
        {
            $Type: 'UI.DataField',
            Value: fileName
        },
        {
            $Type: 'UI.DataField',
            Value: uploadedBy
        },
        {
            $Type: 'UI.DataField',
            Value: uploadedAt
        },
        {
            $Type: 'UI.DataField',
            Value: status
        },
        {Value: content},
        // {
        //     $Type: 'UI.DataFieldForAction',
        //     Action: 'DocumentIntelligence.uploadDocument',
        //     Label: 'Upload Document',
            
        // }
    ],
);

annotate service.ExtractedInvoices with @(

    UI.FieldGroup #Invoicedetails: {
         $Type: 'UI.FieldGroupType',
        Data : [
        {
            Label: 'Invoice Number',
            Value: invoiceNumber
        },
        {
            Label: 'vendor Name',
            Value: vendorName
        },
        {
            Label: 'Invoice Date',
            Value: invoiceDate
        },
        {
            Label: 'Total Amount',
            Value: totalAmount
        },
        {
            Label: 'Currency',
            Value: currency
        }
        ],
    },

    UI.LineItem      : [
        {Value: invoiceNumber},
        {Value: vendorName},
        {Value: invoiceDate},
        {Value: totalAmount},
        {Value: currency}
    ],

    // UI.Facets        : [{
    //     $Type : 'UI.ReferenceFacet',
    //     Label : 'Line Items',
    //     Target: 'lineItems/@UI.LineItem'
    // }]
);

annotate service.LineItems with @(UI.LineItem #LineItems: [
    {Value: position},
    {Value: description},
    {Value: quantity},
    {Value: unitPrice},
    {Value: lineTotal},
    {Value: unit}
]);
annotate service.AuditLogs with @(
    UI.LineItem #AuditLogs:[
        {Value: action},
        {Value: status},
    ]
)