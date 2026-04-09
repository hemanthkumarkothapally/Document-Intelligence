sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "documentintelligenceui/controller/BaseController",
    'sap/ui/model/Filter',
    'sap/ui/model/FilterOperator',
    "sap/ui/core/BusyIndicator",
    'sap/m/MessageToast'
], (Controller, Fragment, BaseController, Filter, FilterOperator, BusyIndicator,MessageToast) => {
    "use strict";

    return BaseController.extend("documentintelligenceui.controller.DocumentsList", {
        onInit() {
            this.getRouter().getRoute("DocumentsList").attachPatternMatched(this._onRouteMatched, this)

        },
        _onRouteMatched: function (oEvent) {
            const oLocalModel = new sap.ui.model.json.JSONModel({
                isDelete: false
            });

            this.getView().setModel(oLocalModel, "LocalModel");
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
        },
        onDocumentsSelectChange: function (oEvent) {
            const oTable = this.byId("documentsTable");
            const aSelectedItems = oTable.getSelectedItems();
            this._aSelectedContexts = aSelectedItems.map(item =>
                item.getBindingContext()
            );
            this.getView().getModel("LocalModel")
                .setProperty("/isDelete", this._aSelectedContexts.length > 0);
        },
        onDeletePress: async function () {
            if (!this._aSelectedContexts || this._aSelectedContexts.length === 0) {
                MessageToast.show("No items selected");
                return;
            }
            try {
                for (let oContext of this._aSelectedContexts) {
                    await oContext.delete("$auto");
                }
                MessageToast.show("Deleted successfully");
                this.byId("documentsTable").removeSelections();
                this.getModel("LocalModel").setProperty("/isDelete", false);

            } catch (err) {
                console.error(err);
                MessageToast.show("Delete failed");
            }
        }
    });
});