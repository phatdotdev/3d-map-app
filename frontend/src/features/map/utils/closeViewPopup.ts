import type SceneView from "@arcgis/core/views/SceneView";

type PopupWithOptionalClose = {
  close?: () => void;
  visible?: boolean;
};

type ViewWithOptionalClosePopup = SceneView & {
  closePopup?: () => void;
};

export function closeViewPopup(view: SceneView) {
  const popup = view.popup as PopupWithOptionalClose | null | undefined;

  if (popup && typeof popup.close === "function") {
    popup.close();
    return;
  }

  const closableView = view as ViewWithOptionalClosePopup;
  if (typeof closableView.closePopup === "function") {
    closableView.closePopup();
    return;
  }

  if (popup) {
    popup.visible = false;
  }
}

