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
            const oModel = this.getOwnerComponent().getModel();

            oView.bindElement({
                path: `/Documents(${sId})`
            });
        },

    });
});