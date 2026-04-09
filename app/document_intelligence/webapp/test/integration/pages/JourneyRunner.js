sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"documentintelligence/test/integration/pages/DocumentsList",
	"documentintelligence/test/integration/pages/DocumentsObjectPage"
], function (JourneyRunner, DocumentsList, DocumentsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('documentintelligence') + '/test/flpSandbox.html#documentintelligence-tile',
        pages: {
			onTheDocumentsList: DocumentsList,
			onTheDocumentsObjectPage: DocumentsObjectPage
        },
        async: true
    });

    return runner;
});

