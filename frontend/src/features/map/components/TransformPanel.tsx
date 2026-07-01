import type { ModelTransformState } from "../types/modelEditing";

type TransformPanelProps = {
  transform: ModelTransformState;
  onTransformChange: (transform: ModelTransformState) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

function renderValue(value: number) {
  return value.toFixed(3);
}

function Row({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-1.5">
      <span className="text-slate-500 text-xs font-semibold">{label}</span>
      <span className="font-bold text-slate-700 text-xs">{renderValue(value)}</span>
    </div>
  );
}

export function TransformPanel({
  transform,
  onTransformChange,
  onConfirm,
  onCancel,
}: TransformPanelProps) {
  function handleScaleChange(value: string) {
    const nextScale = Number(value);

    if (!Number.isFinite(nextScale) || nextScale <= 0) {
      return;
    }

    onTransformChange({
      ...transform,
      scale: nextScale,
    });
  }

  return (
    <aside className="absolute right-4 top-4 z-40 w-[24rem] rounded-xl border border-slate-200 bg-white/95 p-5 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="mb-4">
        <p className="text-[0.65rem] uppercase font-bold tracking-[0.24em] text-arcgis-blue">
          Hiệu chỉnh tọa độ (Transform)
        </p>
        <h2 className="mt-1 text-base font-bold text-slate-800">{transform.name}</h2>
      </div>

      <section className="mb-3.5">
        <p className="mb-1.5 text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
          Vị trí (Position)
        </p>
        <div className="space-y-1.5">
          <Row label="Kinh độ (Longitude)" value={transform.longitude} />
          <Row label="Vĩ độ (Latitude)" value={transform.latitude} />
          <Row label="Độ cao (Elevation)" value={transform.elevation} />
        </div>
      </section>

      <section className="mb-3.5">
        <p className="mb-1.5 text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
          Góc xoay (Rotation)
        </p>
        <div className="space-y-1.5">
          <Row label="Heading" value={transform.heading} />
          <Row label="Tilt" value={transform.tilt} />
          <Row label="Roll" value={transform.roll} />
        </div>
      </section>

      <section>
        <p className="mb-1.5 text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
          Tỉ lệ (Scale)
        </p>
        <label className="block">
          <span className="sr-only">Scale</span>
          <input
            type="number"
            min="0.01"
            step="0.1"
            value={transform.scale}
            onChange={(event) => handleScaleChange(event.target.value)}
            className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100/60"
          />
        </label>
      </section>

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-arcgis-blue px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-arcgis-blue-hover"
        >
          Xác nhận lưu
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          Hủy bỏ
        </button>
      </div>
    </aside>
  );
}
