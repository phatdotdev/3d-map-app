import type { ModelTransformState } from "../types/modelEditing";

type ModelInspectorProps = {
  model: ModelTransformState;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onToggleSplit?: () => void;
  canToggleSplit?: boolean;
  splitActive?: boolean;
  splitBusy?: boolean;
  readOnly?: boolean;
};

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

export function ModelInspector({
  model,
  onEdit,
  onDelete,
  onClose,
  onToggleSplit,
  canToggleSplit = false,
  splitActive = false,
  splitBusy = false,
  readOnly = false,
}: ModelInspectorProps) {
  return (
    <aside className="absolute right-4 top-4 z-40 w-96 rounded-xl border border-slate-200 bg-white/95 p-5 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.24em] text-arcgis-blue">
            Model Inspector
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-800">{model.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          Đóng
        </button>
      </div>

      <div className="space-y-3.5">
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">Mã (ID)</p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">{model.pointId}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">Đường dẫn Model</p>
          <p className="mt-0.5 text-xs font-bold text-slate-700 break-all">{model.modelUrl}</p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
            Tọa độ vị trí
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">
            {formatCoordinate(model.longitude)}, {formatCoordinate(model.latitude)},
            {" "}
            z={formatNumber(model.elevation)} m
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
            Góc xoay (Rotation)
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">
            Heading {formatNumber(model.heading)}°
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">Tỉ lệ (Scale)</p>
          <p className="mt-0.5 text-xs font-bold text-slate-700">
            {formatNumber(model.scale)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        {canToggleSplit ? (
          <button
            type="button"
            disabled={splitBusy}
            onClick={onToggleSplit}
            className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 shadow-sm transition hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {splitBusy ? "Dang tai..." : splitActive ? "Gop model" : "Tach model"}
          </button>
        ) : null}
        {!readOnly ? (
          <>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-lg bg-arcgis-blue px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-arcgis-blue-hover"
        >
          Chỉnh sửa
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 rounded-lg border border-rose-250 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100"
        >
          Xóa đối tượng
        </button>
          </>
        ) : null}
      </div>
    </aside>
  );
}
