import { FiScissors } from "react-icons/fi";

type SliceToggleButtonProps = {
  active: boolean;
  onToggle: () => void;
};

export function SliceToggleButton({
  active,
  onToggle,
}: SliceToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`absolute left-4 top-4 z-20 inline-flex h-11 w-44 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-bold shadow-lg shadow-slate-900/10 backdrop-blur-md transition ${
        active
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-slate-200/90 bg-white/95 text-slate-700 hover:border-arcgis-blue hover:text-arcgis-blue"
      }`}
      aria-pressed={active}
      title="Slice"
    >
      <span
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${
          active ? "bg-amber-500 text-white" : "bg-arcgis-blue text-white"
        }`}
      >
        <FiScissors aria-hidden="true" />
      </span>
      Slice
    </button>
  );
}

