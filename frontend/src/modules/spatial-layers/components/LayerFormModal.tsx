import { useEffect, useState, type FormEvent } from "react";
import { FiSave, FiX } from "react-icons/fi";

import { LayerStyleEditor } from "./LayerStyleEditor";
import { LayerUploadField } from "./LayerUploadField";
import {
  DEFAULT_ICON_DISPLAY,
  DEFAULT_LINE_DISPLAY,
  DEFAULT_MODEL_DISPLAY,
  DEFAULT_POLYGON_DISPLAY,
} from "../constants/layer-defaults";
import type {
  SpatialGeometryType,
  SpatialLayerConfig,
  SpatialLayerDisplayConfig,
} from "../types/spatial-layer.types";

type LayerFormMode = "create" | "edit";

type LayerFormModalProps = {
  mode: LayerFormMode;
  layer: SpatialLayerConfig | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (layer: SpatialLayerConfig, file: File | null) => Promise<void>;
};

const GEOMETRY_TYPES: SpatialGeometryType[] = [
  "Point",
  "LineString",
  "Polygon",
  "MultiPolygon",
];

function fieldClassName() {
  return "h-9 w-full rounded-lg border border-slate-200 bg-slate-50/30 px-3 text-sm text-slate-800 outline-none transition focus:border-arcgis-blue focus:bg-white focus:ring-2 focus:ring-blue-100/60";
}

function toLayerId(name: string) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${slug || "geojson-layer"}-${Date.now()}`;
}

function createDisplayForGeometry(
  geometryType: SpatialGeometryType,
): SpatialLayerDisplayConfig {
  if (geometryType === "Point") {
    return {
      mode: "icon",
      z: 0,
      zoomRule: {
        enabled: true,
        switchToModelScale: 3000,
        farMode: "icon",
        nearMode: "model",
      },
      icon: {
        ...DEFAULT_ICON_DISPLAY,
      },
      model: {
        ...DEFAULT_MODEL_DISPLAY,
      },
    };
  }

  if (geometryType === "LineString") {
    return {
      mode: "line",
      z: 0,
      line: {
        ...DEFAULT_LINE_DISPLAY,
      },
    };
  }

  return {
    mode: "polygon",
    z: 0,
    polygon: {
      ...DEFAULT_POLYGON_DISPLAY,
    },
  };
}

function createEmptyLayerConfig(): SpatialLayerConfig {
  const geometryType: SpatialGeometryType = "Point";

  return {
    id: "",
    name: "",
    description: "",
    sourceType: "geojson",
    sourcePath: "",
    geometryType,
    enabled: true,
    visible: true,
    order: Date.now(),
    display: createDisplayForGeometry(geometryType),
    popup: {
      enabled: false,
    },
    fields: {
      idField: "OBJECTID",
      titleField: "OBJECTID",
    },
    performance: {
      maxFeatures: 5000,
      loadStrategy: "all",
      useClustering: false,
      simplifyGeometry: false,
    },
    metadata: {
      category: "uploaded",
      editable: true,
    },
  };
}

function cloneLayer(layer: SpatialLayerConfig) {
  return JSON.parse(JSON.stringify(layer)) as SpatialLayerConfig;
}

export function LayerFormModal({
  mode,
  layer,
  isSaving,
  error,
  onClose,
  onSubmit,
}: LayerFormModalProps) {
  const [draft, setDraft] = useState<SpatialLayerConfig>(() =>
    layer ? cloneLayer(layer) : createEmptyLayerConfig(),
  );
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(layer ? cloneLayer(layer) : createEmptyLayerConfig());
    setFile(null);
    setLocalError(null);
  }, [layer, mode]);

  function updateGeometryType(geometryType: SpatialGeometryType) {
    setDraft((current) => ({
      ...current,
      geometryType,
      display: createDisplayForGeometry(geometryType),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    if (!draft.name.trim()) {
      setLocalError("Vui lòng nhập tên layer.");
      return;
    }

    if (mode === "create" && !file) {
      setLocalError("Vui lòng chọn file GeoJSON để thêm layer mới.");
      return;
    }

    const nextLayer = {
      ...draft,
      id: draft.id || toLayerId(draft.name),
      name: draft.name.trim(),
      description: draft.description?.trim(),
      sourceType: "geojson" as const,
    };

    await onSubmit(nextLayer, file);
  }

  const title = mode === "create" ? "Thêm layer GeoJSON" : "Sửa layer";
  const submitLabel = mode === "create" ? "Thêm layer" : "Lưu thay đổi";
  const visibleError = localError ?? error;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-4 py-6 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[calc(100vh-3rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-xl transition-all duration-300"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-400 font-medium">
              File upload sẽ được lưu qua backend và phân phối lại cho map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng form layer"
            title="Đóng"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block sm:col-span-1">
              <span className="mb-1.5 block text-xs font-bold text-slate-500">
                Tên layer *
              </span>
              <input
                type="text"
                value={draft.name}
                className={fieldClassName()}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <span className="mb-1.5 block text-xs font-bold text-slate-500">
                Geometry
              </span>
              <select
                value={draft.geometryType}
                className={fieldClassName()}
                onChange={(event) =>
                  updateGeometryType(event.target.value as SpatialGeometryType)
                }
              >
                {GEOMETRY_TYPES.map((geometryType) => (
                  <option key={geometryType} value={geometryType}>
                    {geometryType}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-500">
              Mô tả
            </span>
            <textarea
              value={draft.description ?? ""}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/30 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-arcgis-blue focus:bg-white focus:ring-2 focus:ring-blue-100/60"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.visible}
                className="h-4 w-4 accent-arcgis-blue cursor-pointer"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    visible: event.target.checked,
                  }))
                }
              />
              Hiển thị mặc định
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.enabled}
                className="h-4 w-4 accent-arcgis-blue cursor-pointer"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    enabled: event.target.checked,
                  }))
                }
              />
              Bật trong danh sách
            </label>
          </div>

          {mode === "edit" && draft.sourcePath ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-500">
                Source path hiện tại
              </span>
              <input
                type="text"
                value={draft.sourcePath}
                className={fieldClassName()}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sourcePath: event.target.value,
                  }))
                }
              />
            </label>
          ) : null}

          <LayerUploadField
            file={file}
            required={mode === "create"}
            onChange={setFile}
          />

          <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            <h3 className="mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
              Kiểu hiển thị
            </h3>
            <LayerStyleEditor layer={draft} onChange={setDraft} />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-500">
              Giới hạn feature render
            </span>
            <input
              type="number"
              min={0}
              value={draft.performance?.maxFeatures ?? 5000}
              className={fieldClassName()}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  performance: {
                    ...current.performance,
                    maxFeatures: Number(event.target.value),
                    loadStrategy: current.performance?.loadStrategy ?? "all",
                  },
                }))
              }
            />
          </label>

          {visibleError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {visibleError}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-arcgis-blue px-4 text-xs font-bold text-white shadow-sm transition hover:bg-arcgis-blue-hover disabled:cursor-wait disabled:opacity-60"
          >
            <FiSave aria-hidden="true" />
            {isSaving ? "Đang lưu..." : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
