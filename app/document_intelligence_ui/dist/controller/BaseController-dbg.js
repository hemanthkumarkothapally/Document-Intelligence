sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, Fragment, Filter, FilterOperator, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("pw.productionwarehouse.controller.BaseController", {

        /**
         * Convenience method for getting the view model by name in every controller of the application.
         * @public
         * @param {string} sName the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },
        getLocalModel: function (sName) {
            return this.getOwnerComponent().getModel(sName);
        },

        /**
         * Convenience method for setting the view model in every controller of the application.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },
        getRouter: function () {
            return this.getOwnerComponent().getRouter();
        },
        getBaseURL: function () {
            return sap.ui.require.toUrl("pw/productionwarehouse");
        },
        getWarningMessageBox: function (sText) {
            MessageBox.warning(sText);
        },
        loadFragment: function (sPath) {
            let oView = this.getView();
            return Fragment.load({
                id: oView.getId(),
                name: sPath,
                controller: this
            }).then(function (oDialog) {
                oView.addDependent(oDialog);
                return oDialog;
            });
        }

    });
});