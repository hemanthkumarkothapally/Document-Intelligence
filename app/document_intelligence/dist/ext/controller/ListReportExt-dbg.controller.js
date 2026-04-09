sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "sap/ui/unified/FileUploader",
  "sap/m/MessageToast"
], function (ControllerExtension, FileUploader, MessageToast) {
  "use strict";

  return ControllerExtension.extend("documentintelligence.ext.controller.ListReportExt", {

    override: {
      onInit: function () {
        // optional
      }
    },

    onUploadPress: function () {

      MessageToast.show("Clicked!"); // test

      const oUploader = new FileUploader({
        fileType: ["pdf"],

        change: (oEvent) => {

          const file = oEvent.getParameter("files")[0];
          if (!file) return;

          const reader = new FileReader();

          reader.onload = (e) => {

            const base64 = e.target.result.split(",")[1];

            const payload = {
              fileName: file.name,
              mediaType: file.type,
              content: base64
            };

            const oModel = this.base.getView().getModel(); // ✅ FIX

            oModel.create("/Documents", payload, {
              success: () => MessageToast.show("Upload successful"),
              error: () => MessageToast.show("Upload failed")
            });
          };

          reader.readAsDataURL(file);
        }
      });

      oUploader.openFileDialog();
    }

  });
});