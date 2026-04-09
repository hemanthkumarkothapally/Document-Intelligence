sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "documentintelligenceui/controller/BaseController",

], (Controller, BaseController) => {
    "use strict";

    return BaseController.extend("documentintelligenceui.controller.DocumentDetails", {
        onInit() {
            this.getRouter().getRoute("DocumentDetails").attachPatternMatched(this._onRouteMatched, this)
        },
        _onRouteMatched: function (oEvent) {
            const sId = oEvent.getParameter("arguments").id;
            const oView = this.getView();
            oView.bindElement({
                path: `/Documents(${sId})`
            });
            const oEditModel = new sap.ui.model.json.JSONModel({
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
            this.getView().getModel().refresh();
        },

        onSavePress: async function () {
            try {
                await this.getView().getModel().submitBatch("$auto");
                this.getModel("EditModel").setProperty("/isEdit", false);
                this.getModel().refresh();
                sap.m.MessageToast.show("Saved");
            } catch (e) {
                sap.m.MessageToast.show("Error");
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
        }
        // onSavePress: async function () {

        //     const oView = this.getView();
        //     const oModel = this.getModel();

        //     const newData = oView.getBindingContext().getObject();
        //     const oldData = this._originalData;

        //     const changes = [];
        //     //INVOICE CHANGES
        //     const invoiceFields = [
        //         "invoiceNumber",
        //         "vendorName",
        //         "invoiceDate",
        //         "totalAmount",
        //         "currency"
        //     ];

        //     invoiceFields.forEach(field => {
        //         if (oldData.invoice?.[field] !== newData.invoice?.[field]) {
        //             changes.push({
        //                 entity: "Invoice",
        //                 type: "UPDATED",
        //                 field,
        //                 old: oldData.invoice?.[field],
        //                 new: newData.invoice?.[field]
        //             });
        //         }
        //     });
        //     //LINE ITEMS CHANGES
        //     const oldItems = oldData.invoice?.lineItems || [];
        //     const newItems = newData.invoice?.lineItems || [];
        //     const oldMap = new Map(oldItems.map(i => [i.ID, i]));
        //     const newMap = new Map(newItems.map(i => [i.ID, i]));

        //     // 🔹 UPDATED
        //     newItems.forEach(item => {
        //         const oldItem = oldMap.get(item.ID);

        //         if (oldItem) {
        //             ["description", "quantity", "unitPrice", "lineTotal"].forEach(field => {
        //                 if (oldItem[field] !== item[field]) {
        //                     changes.push({
        //                         entity: "LineItem",
        //                         type: "UPDATED",
        //                         field,
        //                         old: oldItem[field],
        //                         new: item[field]
        //                     });
        //                 }
        //             });
        //         }
        //     });
        //     try {
        //         await oModel.submitBatch("$auto");
        //         if (changes.length > 0) {
        //             const payload = {
        //                 document_ID: newData.ID,
        //                 action: "UPDATED",
        //                 performedBy: "user",
        //                 performedAt: new Date(),
        //                 details: JSON.stringify({
        //                     entity: "Invoice + LineItems",
        //                     changes
        //                 })
        //             };

        //             const oBinding = oModel.bindList("/AuditLogs");
        //             await oBinding.create(payload);
        //         }

        //         // ==========================
        //         // 🔄 RESET UI
        //         // ==========================
        //         oView.getModel("ui").setProperty("/isEdit", false);
        //         oModel.refresh();

        //         sap.m.MessageToast.show("Saved with audit log");

        //     } catch (err) {
        //         console.error(err);
        //         sap.m.MessageToast.show("Save failed");
        //     }
        // }
    });
});