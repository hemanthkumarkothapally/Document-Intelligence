sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "documentintelligenceui/controller/BaseController",
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    "sap/ui/core/BusyIndicator"
], (Controller, Fragment, BaseController, Filter, FilterOperator, BusyIndicator) => {
    "use strict";

    return BaseController.extend("documentintelligenceui.controller.DocumentsList", {
        onInit() {
            this.getRouter().getRoute("DocumentsList").attachPatternMatched(this._onRouteMatched, this)

        },
        onGoBtnPress: function () {
            const oFilterBar = this.byId("idFilterBar");
            const aFilters = [];

            const aItems = oFilterBar.getFilterGroupItems();

            aItems.forEach(item => {
                const sName = item.getName();
                const oControl = item.getControl();
                const sValue = oControl.getValue ? oControl.getValue() : oControl.getSelectedKey();

                if (sValue) {
                    aFilters.push(new sap.ui.model.Filter(sName, "Contains", sValue));
                }
            });

            const oTable = this.byId("documentsTable");
            const oBinding = oTable.getBinding("items");

            oBinding.filter(aFilters);
        },
        onDocumentUploadBtnPress: function (oEvent) {
            if (!this._DocumentsDialog) {
                this._DocumentsDialog = this.loadFragment("documentintelligenceui.view.fragments.UploadDialog")
            }
            this._DocumentsDialog.then(function (oDialog) {
                oDialog.open();
            });
        },
        onFileUploadPress: async function () {
            this.onCloseUploadDialogPress();
            const oView = this.getView();
            oView.setBusy(true);
            debugger
            const oFile = this.byId("idFileUploader").getFocusDomRef().files[0]
            if (!oFile) {
                sap.m.MessageTost.Show("File is not selected")
                 oView.setBusy(false);
                return;
            }
            const toBase64 = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(",")[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const base64Content = await toBase64(oFile);
            console.log(base64Content);
            const payload = {
                fileName: oFile.name,
                rawText: base64Content
            };
            const oModel = this.getOwnerComponent().getModel();
            try {
                const oAction = await oModel.bindContext("/uploadDocument(...)");
                oAction.setParameter("fileName", payload.fileName);
                oAction.setParameter("rawText", payload.rawText);
                await oAction.execute();
                const oResponse = oAction.getBoundContext().getObject();
                console.log("Response:", oResponse);
                sap.m.MessageToast.show("Upload successful");
                const documentId = oResponse.ID; // ✅ IMPORTANT

                // 🔹 2. Call processDocument
                await oModel.bindContext("/processDocument(...)")
                    .setParameter("documentId", documentId)
                    .execute();

                sap.m.MessageToast.show("Processing started");
                this.getView().getModel().refresh();

            } catch (err) {
                console.error(err);
                sap.m.MessageToast.show("Upload failed");
            }
            oView.setBusy(false);
        },
        onCloseUploadDialogPress() {
            this._DocumentsDialog.then(function (oDialog) {
                oDialog.close();
            });
        },
        onNavigationPress: function (oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();

            const documentId = oContext.getProperty("ID");

            this.getOwnerComponent().getRouter().navTo("DocumentDetails", {
                id: documentId
            });
        }
    });
});