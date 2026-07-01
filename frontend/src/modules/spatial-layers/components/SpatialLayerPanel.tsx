import { useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";

import { FloatingLayerButton } from "./FloatingLayerButton";
import { LayerFormModal } from "./LayerFormModal";
import { SpatialFeatureDetailsPanel } from "./SpatialFeatureDetailsPanel";
import { SpatialLayerItem } from "./SpatialLayerItem";
import type {
  SelectedSpatialFeature,
  SpatialLayerConfig,
  SpatialLayerState,
} from "../types/spatial-layer.types";

type SpatialLayerPanelProps = {
  layers: SpatialLayerState[];
  loading: boolean;
  error: string | null;
  selectedFeature: SelectedSpatialFeature | null;
  editingFeatureId: string | null;
  onToggleLayer: (layerId: string, visible: boolean) => void;
  onReloadLayer: (layerId: string) => void;
  onAddLayer: (layer: SpatialLayerConfig, file: File) => Promise<void>;
  onUpdateLayer: (
    layerId: string,
    layer: SpatialLayerConfig,
    file?: File | null,
  ) => Promise<void>;
  onDeleteLayer: (layerId: string) => Promise<void>;
  onStartFeatureEdit: (feature: SelectedSpatialFeature) => Promise<void>;
  onConfirmFeatureEdit: () => Promise<void>;
  onCancelFeatureEdit: () => Promise<void>;
  onCloseSelectedFeature: () => void;
  readOnly?: boolean;
};

type FormMode = "create" | "edit";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function SpatialLayerPanel({
  layers,
  loading,
  error,
  selectedFeature,
  editingFeatureId,
  onToggleLayer,
  onReloadLayer,
  onAddLayer,
  onUpdateLayer,
  onDeleteLayer,
  onStartFeatureEdit,
  onConfirmFeatureEdit,
  onCancelFeatureEdit,
  onCloseSelectedFeature,
  readOnly = false,
}: SpatialLayerPanelProps) {
  const [open, setOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingLayer, setEditingLayer] = useState<SpatialLayerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  function openCreateForm() {
    if (readOnly) return;

    setOperationError(null);
    setEditingLayer(null);
    setFormMode("create");
  }

  function openEditForm(layerId: string) {
    if (readOnly) return;

    const layer = layers.find((item) => item.config.id === layerId);
    if (!layer) return;

    setOperationError(null);
    setEditingLayer(layer.config);
    setFormMode("edit");
  }

  function closeForm() {
    if (saving) return;
    setFormMode(null);
    setEditingLayer(null);
    setOperationError(null);
  }

  async function handleSubmit(layer: SpatialLayerConfig, file: File | null) {
    if (!formMode) return;

    setSaving(true);
    setOperationError(null);

    try {
      if (formMode === "create") {
        if (!file) {
          throw new Error("Vui lòng chọn file GeoJSON.");
        }

        await onAddLayer(layer, file);
      } else {
        await onUpdateLayer(layer.id, layer, file);
      }

      setFormMode(null);
      setEditingLayer(null);
      setOpen(true);
    } catch (submitError: unknown) {
      setOperationError(toErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(layerId: string) {
    if (readOnly) return;

    const layer = layers.find((item) => item.config.id === layerId);
    if (!layer) return;

    const confirmed = window.confirm(`Xóa layer "${layer.config.name}" khỏi danh sách?`);
    if (!confirmed) return;

    setOperationError(null);

    try {
      await onDeleteLayer(layerId);
    } catch (deleteError: unknown) {
      setOperationError(toErrorMessage(deleteError));
    }
  }

  return (
    <>
      <FloatingLayerButton
        open={open}
        layerCount={layers.length}
        onClick={() => setOpen((current) => !current)}
      />

      {open ? (
        <aside className="absolute right-4 top-4 z-30 flex max-h-[calc(100vh-2rem)] w-[24rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md transition-all duration-300">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Danh sách lớp dữ liệu</h2>
              <p className="mt-0.5 text-xs text-slate-500 font-medium">
                {layers.length} layer GeoJSON
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openCreateForm}
                hidden={readOnly}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-arcgis-blue px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-arcgis-blue-hover"
              >
                <FiPlus aria-hidden="true" />
                Thêm
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Đóng panel layer"
                title="Đóng"
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {loading ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Đang đọc cấu hình layer...
              </p>
            ) : null}

            {error ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </p>
            ) : null}

            {operationError ? (
              <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {operationError}
              </p>
            ) : null}

            {!loading && !error ? (
              <div className="space-y-2">
                {layers.map((layer) => (
                  <SpatialLayerItem
                    key={layer.config.id}
                    layer={layer}
                    onToggle={onToggleLayer}
                    onReload={onReloadLayer}
                    onEdit={openEditForm}
                    onDelete={handleDelete}
                    readOnly={readOnly}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {formMode ? (
        <LayerFormModal
          mode={formMode}
          layer={editingLayer}
          isSaving={saving}
          error={operationError}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      <SpatialFeatureDetailsPanel
        feature={selectedFeature}
        editing={Boolean(
          selectedFeature &&
            editingFeatureId ===
              `${selectedFeature.sourceLayerId}:${selectedFeature.id}`,
        )}
        onStartEdit={onStartFeatureEdit}
        onConfirmEdit={onConfirmFeatureEdit}
        onCancelEdit={onCancelFeatureEdit}
        onClose={onCloseSelectedFeature}
        readOnly={readOnly}
      />
    </>
  );
}
