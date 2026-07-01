import {
  DEFAULT_ICON_DISPLAY,
  DEFAULT_LINE_DISPLAY,
  DEFAULT_MODEL_DISPLAY,
  DEFAULT_POLYGON_DISPLAY,
} from "../constants/layer-defaults";
import type {
  SpatialLayerConfig,
  SpatialLayerDisplayConfig,
} from "../types/spatial-layer.types";

type LayerStyleEditorProps = {
  layer: SpatialLayerConfig;
  onChange: (layer: SpatialLayerConfig) => void;
};

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function fieldClassName() {
  return "h-9 w-full rounded-lg border border-slate-200 bg-slate-50/20 px-3 text-sm text-slate-800 outline-none transition focus:border-arcgis-blue focus:bg-white focus:ring-2 focus:ring-blue-100/50";
}

export function LayerStyleEditor({ layer, onChange }: LayerStyleEditorProps) {
  const display = layer.display;

  function updateDisplay(patch: Partial<SpatialLayerDisplayConfig>) {
    onChange({
      ...layer,
      display: {
        ...display,
        ...patch,
      },
    });
  }

  function updateZ(value: string) {
    updateDisplay({
      z: toNumber(value, display.z ?? 0),
    });
  }

  if (layer.geometryType === "Point") {
    const icon = display.icon ?? DEFAULT_ICON_DISPLAY;
    const model = display.model ?? DEFAULT_MODEL_DISPLAY;
    const zoomRule = display.zoomRule ?? {
      enabled: false,
      switchToModelScale: 3000,
      farMode: "icon" as const,
      nearMode: "model" as const,
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Màu pin
            </span>
            <input
              type="color"
              value={icon.color ?? DEFAULT_ICON_DISPLAY.color}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white p-1 cursor-pointer focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
              onChange={(event) =>
                updateDisplay({
                  icon: {
                    ...icon,
                    color: event.target.value,
                  },
                })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Z mặc định
            </span>
            <input
              type="number"
              value={display.z ?? 0}
              className={fieldClassName()}
              onChange={(event) => updateZ(event.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Rộng pin
            </span>
            <input
              type="number"
              min={8}
              value={icon.width}
              className={fieldClassName()}
              onChange={(event) =>
                updateDisplay({
                  icon: {
                    ...icon,
                    width: toNumber(event.target.value, icon.width),
                  },
                })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Cao pin
            </span>
            <input
              type="number"
              min={8}
              value={icon.height}
              className={fieldClassName()}
              onChange={(event) =>
                updateDisplay({
                  icon: {
                    ...icon,
                    height: toNumber(event.target.value, icon.height),
                  },
                })
              }
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={model.enabled}
            className="h-4 w-4 accent-arcgis-blue cursor-pointer"
            onChange={(event) =>
              updateDisplay({
                model: {
                  ...model,
                  enabled: event.target.checked,
                },
              })
            }
          />
          Bật model 3D khi zoom gần
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Model URL
            </span>
            <input
              type="text"
              value={model.url}
              className={`${fieldClassName()} w-full`}
              onChange={(event) =>
                updateDisplay({
                  model: {
                    ...model,
                    url: event.target.value,
                  },
                })
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Scale model
            </span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={model.width}
              className={fieldClassName()}
              onChange={(event) => {
                const size = toNumber(event.target.value, model.width);
                updateDisplay({
                  model: {
                    ...model,
                    width: size,
                    height: size,
                    depth: size,
                  },
                });
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Scale đổi model
            </span>
            <input
              type="number"
              min={1}
              value={zoomRule.switchToModelScale}
              className={fieldClassName()}
              onChange={(event) =>
                updateDisplay({
                  zoomRule: {
                    ...zoomRule,
                    enabled: true,
                    switchToModelScale: toNumber(
                      event.target.value,
                      zoomRule.switchToModelScale,
                    ),
                  },
                })
              }
            />
          </label>
        </div>
      </div>
    );
  }

  if (layer.geometryType === "LineString") {
    const line = display.line ?? DEFAULT_LINE_DISPLAY;
    const flatWidth = line.flatWidth ?? line.width;
    const pipeWidth = line.pipeWidth ?? line.width;

    return (
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">
            Màu line
          </span>
          <input
            type="color"
            value={line.color}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white p-1 cursor-pointer focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
            onChange={(event) =>
              updateDisplay({
                line: {
                  ...line,
                  color: event.target.value,
                },
              })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">
            Độ rộng
          </span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={flatWidth}
            className={fieldClassName()}
            onChange={(event) =>
              updateDisplay({
                line: {
                  ...line,
                  flatWidth: toNumber(event.target.value, flatWidth),
                },
              })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-bold text-slate-500">
            Pipe diameter (m)
          </span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={pipeWidth}
            className={fieldClassName()}
            onChange={(event) => {
              const nextPipeWidth = toNumber(event.target.value, pipeWidth);

              updateDisplay({
                line: {
                  ...line,
                  width: nextPipeWidth,
                  pipeWidth: nextPipeWidth,
                  profile: "circle",
                },
              });
            }}
          />
        </label>
        <label className="col-span-2 block">
          <span className="mb-1 block text-xs font-bold text-slate-500">
            Z mặc định
          </span>
          <input
            type="number"
            value={display.z ?? 0}
            className={`${fieldClassName()} w-full`}
            onChange={(event) => updateZ(event.target.value)}
          />
        </label>
      </div>
    );
  }

  const polygon = display.polygon ?? DEFAULT_POLYGON_DISPLAY;

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">
          Màu fill
        </span>
        <input
          type="color"
          value={polygon.fillColor}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white p-1 cursor-pointer focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
          onChange={(event) =>
            updateDisplay({
              polygon: {
                ...polygon,
                fillColor: event.target.value,
              },
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">
          Opacity
        </span>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={polygon.fillOpacity}
          className={fieldClassName()}
          onChange={(event) =>
            updateDisplay({
              polygon: {
                ...polygon,
                fillOpacity: toNumber(event.target.value, polygon.fillOpacity),
              },
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">
          Màu viền
        </span>
        <input
          type="color"
          value={polygon.outlineColor}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white p-1 cursor-pointer focus:border-arcgis-blue focus:ring-2 focus:ring-blue-100"
          onChange={(event) =>
            updateDisplay({
              polygon: {
                ...polygon,
                outlineColor: event.target.value,
              },
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-bold text-slate-500">
          Độ rộng viền
        </span>
        <input
          type="number"
          min={0}
          step={0.25}
          value={polygon.outlineWidth}
          className={fieldClassName()}
          onChange={(event) =>
            updateDisplay({
              polygon: {
                ...polygon,
                outlineWidth: toNumber(event.target.value, polygon.outlineWidth),
              },
            })
          }
        />
      </label>
    </div>
  );
}
