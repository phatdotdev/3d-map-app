import { FiUpload } from "react-icons/fi";

type LayerUploadFieldProps = {
  file: File | null;
  required?: boolean;
  onChange: (file: File | null) => void;
};

export function LayerUploadField({
  file,
  required = false,
  onChange,
}: LayerUploadFieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-500">
        File GeoJSON {required ? "*" : ""}
      </span>
      <span className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-600 transition hover:border-arcgis-blue hover:bg-arcgis-blue-light/20 hover:text-arcgis-blue">
        <FiUpload className="shrink-0 text-arcgis-blue" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {file ? file.name : "Chọn file .geojson hoặc .json"}
        </span>
        <input
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          className="sr-only"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
      </span>
    </label>
  );
}
