import { FiEdit2, FiRefreshCw, FiTrash2 } from "react-icons/fi";

import type { SpatialLayerState } from "../types/spatial-layer.types";

type SpatialLayerItemProps = {
  layer: SpatialLayerState;
  onToggle: (layerId: string, visible: boolean) => void;
  onReload: (layerId: string) => void;
  onEdit: (layerId: string) => void;
  onDelete: (layerId: string) => void;
  readOnly?: boolean;
};

function getStatusLabel(layer: SpatialLayerState) {
  if (layer.status === "loading") return "Đang tải";
  if (layer.status === "ready") return "Sẵn sàng";
  if (layer.status === "error") return "Lỗi";
  return "Chờ";
}

export function SpatialLayerItem({
  layer,
  onToggle,
  onReload,
  onEdit,
  onDelete,
  readOnly = false,
}: SpatialLayerItemProps) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 text-slate-800 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={layer.visible}
          onChange={(event) => onToggle(layer.config.id, event.target.checked)}
          className="mt-1 h-4 w-4 accent-arcgis-blue cursor-pointer"
          aria-label={`Bật tắt ${layer.config.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-xs font-bold text-slate-800">{layer.config.name}</h3>
            <span className="shrink-0 rounded bg-arcgis-blue-light px-2 py-0.5 text-[0.65rem] font-bold text-blue-700">
              {layer.config.geometryType}
            </span>
          </div>
          {layer.config.description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-4 text-slate-500">
              {layer.config.description}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500 font-medium">{getStatusLabel(layer)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(layer.config.id)}
                hidden={readOnly}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-arcgis-blue hover:bg-arcgis-blue-light/40 hover:text-arcgis-blue"
                aria-label={`Sửa ${layer.config.name}`}
                title="Sửa"
              >
                <FiEdit2 aria-hidden="true" size={13} />
              </button>
              <button
                type="button"
                onClick={() => onReload(layer.config.id)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-arcgis-blue hover:bg-arcgis-blue-light/40 hover:text-arcgis-blue disabled:cursor-wait disabled:opacity-50"
                disabled={layer.status === "loading"}
                aria-label={`Tải lại ${layer.config.name}`}
                title="Tải lại"
              >
                <FiRefreshCw aria-hidden="true" size={13} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(layer.config.id)}
                hidden={readOnly}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Xóa ${layer.config.name}`}
                title="Xóa"
              >
                <FiTrash2 aria-hidden="true" size={13} />
              </button>
            </div>
          </div>
          {layer.error ? (
            <p className="mt-2 break-words rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {layer.error}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
