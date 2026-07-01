import { FiEdit2, FiSave, FiX } from "react-icons/fi";

import type { SelectedSpatialFeature } from "../types/spatial-layer.types";

type SpatialFeatureDetailsPanelProps = {
  feature: SelectedSpatialFeature | null;
  editing: boolean;
  onStartEdit: (feature: SelectedSpatialFeature) => Promise<void>;
  onConfirmEdit: () => Promise<void>;
  onCancelEdit: () => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
};

function formatAttributeValue(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return JSON.stringify(value);
}

function getAttributeEntries(feature: SelectedSpatialFeature) {
  return Object.entries(feature.attributes).filter(
    ([key]) =>
      key !== "sourceLayerId" &&
      key !== "sourceLayerName" &&
      key !== "geometryType",
  );
}

export function SpatialFeatureDetailsPanel({
  feature,
  editing,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onClose,
  readOnly = false,
}: SpatialFeatureDetailsPanelProps) {
  if (!feature) return null;

  const canEditMap = !readOnly && feature.mapEditable !== false;

  return (
    <aside className="absolute right-4 top-4 z-40 flex max-h-[calc(100vh-2rem)] w-[24rem] flex-col rounded-xl border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/40 p-4">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-arcgis-blue">
            {feature.geometryType}
          </p>
          <h2 className="mt-1 truncate text-base font-bold text-slate-800">
            {feature.sourceLayerName}
          </h2>
          <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">ID {feature.id}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng chi tiết"
          title="Đóng"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 overflow-auto p-4">
        {canEditMap ? (
          <div className="mb-4 flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => void onConfirmEdit()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-bold text-white"
                >
                  <FiSave aria-hidden="true" />
                  Save map edit
                </button>
                <button
                  type="button"
                  onClick={() => void onCancelEdit()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800"
                >
                  <FiX aria-hidden="true" />
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void onStartEdit(feature)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-arcgis-blue px-3 py-2 text-xs font-bold text-white"
              >
                <FiEdit2 aria-hidden="true" />
                Edit map
              </button>
            )}
          </div>
        ) : null}

        <dl className="space-y-2">
          {getAttributeEntries(feature).map(([key, value]) => (
            <div
              key={key}
              className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
            >
              <dt className="break-words text-[0.65rem] font-bold uppercase tracking-[0.14em] text-slate-500">
                {key}
              </dt>
              <dd className="mt-1 break-words text-xs font-semibold leading-5 text-slate-700">
                {formatAttributeValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}
