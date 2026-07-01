import { FiX } from "react-icons/fi";
import type { MapDisplaySettings } from "../types/mapDisplaySettings";

type MapDisplaySettingsPanelProps = {
  currentScale: number;
  settings: MapDisplaySettings;
  onChange: (settings: MapDisplaySettings) => void;
  onClose: () => void;
};

function formatScale(value: number) {
  return `1:${Math.max(1, Math.round(value)).toLocaleString("en-US")}`;
}

function parseNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function MapDisplaySettingsPanel({
  currentScale,
  settings,
  onChange,
  onClose,
}: MapDisplaySettingsPanelProps) {
  return (
    <aside className="absolute top-4 right-4 z-30 w-[24rem] rounded-xl border border-slate-200 bg-white/95 p-5 text-sm text-slate-850 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase font-bold tracking-[0.24em] text-arcgis-blue">
            Cài đặt bản đồ
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-800">Cấu hình hiển thị</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Đóng cài đặt bản đồ"
          title="Đóng"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500 font-medium">
        Giảm độ mờ mặt đất để nhìn thực thể ở dưới nền. Khi scale gần hơn ngưỡng, model 3D sẽ hiện và map pin sẽ ẩn.
      </p>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
            Bản đồ nền (Basemap)
          </span>
          <select
            value={settings.basemap}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-850 outline-none transition focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
            onChange={(event) =>
              onChange({
                ...settings,
                basemap: event.target.value as MapDisplaySettings["basemap"],
              })
            }
          >
            <option value="osm">
              OpenStreetMap (OSM)
            </option>
            <option value="arcgis-streets">
              ArcGIS Đường phố (Streets)
            </option>
            <option value="arcgis-satellite">
              ArcGIS Vệ tinh (Satellite)
            </option>
            <option value="arcgis-hybrid">
              ArcGIS Vệ tinh lai (Hybrid)
            </option>
            <option value="arcgis-topo">
              ArcGIS Địa hình (Topographic)
            </option>
            <option value="arcgis-dark-gray">
              ArcGIS Nền tối (Dark Gray Canvas)
            </option>
            <option value="arcgis-light-gray">
              ArcGIS Nền sáng (Light Gray Canvas)
            </option>
            <option value="arcgis-navigation">
              ArcGIS Điều hướng (Navigation)
            </option>
          </select>
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
              Độ mờ mặt đất
            </span>
            <span className="text-xs font-bold text-arcgis-blue">
              {Math.round(settings.groundOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={settings.groundOpacity}
            className="w-full accent-arcgis-blue cursor-pointer"
            onChange={(event) =>
              onChange({
                ...settings,
                groundOpacity: parseNumber(
                  event.target.value,
                  settings.groundOpacity,
                ),
              })
            }
          />
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[0.65rem] uppercase font-bold tracking-[0.2em] text-slate-400">
              Ngưỡng hiện Model 3D
            </span>
            <span className="text-xs font-bold text-arcgis-blue">
              {formatScale(settings.modelSwitchScale)}
            </span>
          </div>
          <input
            type="number"
            min={1}
            step={1}
            value={settings.modelSwitchScale}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 text-sm text-slate-800 outline-none transition focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
            onChange={(event) =>
              onChange({
                ...settings,
                modelSwitchScale: parseNumber(
                  event.target.value,
                  settings.modelSwitchScale,
                ),
              })
            }
          />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/30 px-3 py-3 text-xs leading-relaxed text-slate-600 font-medium">
        <p className="font-bold text-slate-700">Tỉ lệ hiện tại: {formatScale(currentScale || settings.modelSwitchScale)}</p>
        <p className="mt-1 text-[0.68rem] leading-normal text-slate-500">
          • Zoom gần hơn ngưỡng: hiện model, ẩn pin.<br />
          • Zoom xa hơn ngưỡng: ẩn model, hiện pin.
        </p>
      </div>
    </aside>
  );
}
