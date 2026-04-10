sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "documentintelligenceui/controller/BaseController",
    "sap/m/MessageToast",
        "sap/ui/model/json/JSONModel"
], (Controller, BaseController,MessageToast,JSONModel) => {
    "use strict";

    return BaseController.extend("documentintelligenceui.controller.DocumentDetails", {
        onInit() {
            this.getRouter().getRoute("DocumentDetails").attachPatternMatched(this._onRouteMatched, this)
        },
        _onRouteMatched: function (oEvent) {
            const sId = oEvent.getParameter("arguments").id;
            const oView = this.getView();
            oView.bindElement({
                path: `/Documents(${sId})`,
                parameters: {
                    $$updateGroupId: "invoiceGroup"
                }
            });
            const oEditModel = new JSONModel({
                isEdit: false
            });
            this.getView().setModel(oEditModel, "EditModel");
        },
        onEditPress: function () {
            this.getModel("EditModel").setProperty("/isEdit", true);
            const oView = this.getView();
            const oData = JSON.parse(JSON.stringify(oView.getBindingContext().getObject()));
            this._originalData = oData;
            console.log("originalData", this._originalData);
        },

        onCancelEditPress: function () {
            this.getModel("EditModel").setProperty("/isEdit", false);
            this.getView().getModel().resetChanges("invoiceGroup");
        },

        onSavePress: async function () {
            try {
                await this.getView().getModel().submitBatch("invoiceGroup");
                this.getModel("EditModel").setProperty("/isEdit", false);
                this.getModel().refresh();
                MessageToast.show("Saved");
            } catch (e) {
                MessageToast.show("Error");
            }
        },
        formatAuditDetails: function (sDetails) {
            try {
                const obj = JSON.parse(sDetails);
                if (obj.message) {
                    let text = obj.message;
                    if (obj.invoiceId) {
                        text += `\nInvoice ID: ${obj.invoiceId}`;
                    }
                    if (obj.totalLineItems !== undefined) {
                        text += `\nLine Items: ${obj.totalLineItems}`;
                    }
                    if (obj.jobId) {
                        text += `\nJob ID: ${obj.jobId}`;
                    }
                    return text;
                }

                if (obj.changes && Array.isArray(obj.changes)) {
                    return obj.changes.map(change => {
                        if (obj.entity === "Invoice") {
                            return `${change.field}: ${change.old} → ${change.new}`;
                        }
                        if (obj.entity === "LineItem") {
                            return `LineItem ${change.field}: ${change.old} → ${change.new}`;
                        }
                    }).join("\n");
                }
                return sDetails;
            } catch (e) {
                return sDetails;
            }
        },
        onlineItemChange: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            const oModel = oContext.getModel();
            const sPath = oContext.getPath();

            // ✅ safer
            const oData = oContext.getObject();

            const quantity = parseFloat(oData.quantity) || 0;
            const unitPrice = parseFloat(oData.unitPrice) || 0;

            const lineTotal = quantity * unitPrice;

            // ✅ update using path
            oContext.setProperty(sPath + "/lineTotal", lineTotal.toFixed(2));
        }
    });
});