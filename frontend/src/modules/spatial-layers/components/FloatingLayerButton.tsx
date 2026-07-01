import { FiLayers } from "react-icons/fi";

type FloatingLayerButtonProps = {
  open: boolean;
  layerCount: number;
  onClick: () => void;
};

export function FloatingLayerButton({
  open,
  layerCount,
  onClick,
}: FloatingLayerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-4 top-4 z-20 inline-flex h-11 w-52 items-center justify-start gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 text-sm font-bold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-arcgis-blue hover:bg-white hover:text-arcgis-blue hover:shadow-xl active:translate-y-0"
      aria-expanded={open}
      aria-label="Mở lớp dữ liệu"
      title="Lớp dữ liệu"
    >
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-arcgis-blue text-white shadow-sm">
        <FiLayers className="text-base" aria-hidden="true" />
      </span>
      <span>Lớp dữ liệu</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 transition-colors">
        {layerCount}
      </span>
    </button>
  );
}
