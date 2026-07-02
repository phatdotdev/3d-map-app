import { useEffect, useMemo, useState } from "react";
import {
  FiBox,
  FiEdit2,
  FiEye,
  FiMapPin,
  FiMinus,
  FiPlus,
  FiSave,
  FiMove,
  FiTrash2,
  FiX,
} from "react-icons/fi";

import {
  getIndependentEntityId,
  getIndependentEntityType,
  getIndependentModelScale,
  type GeoJsonPosition,
  type IndependentCreationMode,
  type IndependentCreationType,
  type IndependentEntityFeature,
  type IndependentEntityType,
} from "../types/independentEntity";

type IndependentEntityManagerPanelProps = {
  open: boolean;
  features: IndependentEntityFeature[];
  selectedEntityId: string | null;
  creationMode: IndependentCreationMode;
  creationDraft: IndependentEntityFeature | null;
  isDetailOpen: boolean;
  isEditOpen: boolean;
  geometryEditingEntityId: string | null;
  onOpenChange: (open: boolean) => void;
  onStartCreate: (type: IndependentCreationType) => void;
  onCancelCreation: () => void;
  onSelectEntity: (feature: IndependentEntityFeature) => void;
  onOpenEdit: () => void;
  onStartGeometryEdit: (feature: IndependentEntityFeature) => Promise<void>;
  onConfirmGeometryEdit: () => Promise<void>;
  onCancelGeometryEdit: () => Promise<void>;
  onCloseDetail: () => void;
  onCloseEdit: () => void;
  onSaveDraft: (feature: IndependentEntityFeature) => Promise<void>;
  onUpdateEntity: (feature: IndependentEntityFeature) => Promise<void>;
  onDeleteEntity: (feature: IndependentEntityFeature) => Promise<void>;
  readOnly?: boolean;
};

type FilterType = "all" | IndependentEntityType;

type FormState = {
  name: string;
  modelUrl: string;
  styleText: string;
  metadataText: string;
  coordinatesText: string;
  coordinateZ: string;
  flatWidth: string;
  pipeWidth: string;
  scale: string;
  heading: string;
  tilt: string;
  roll: string;
};

const FILTER_OPTIONS: FilterType[] = [
  "all",
  "point",
  "model3d",
  "linestring",
  "polygon",
  "multipolygon",
];

const CREATE_OPTIONS: Array<{
  type: IndependentCreationType;
  label: string;
}> = [
  { type: "point", label: "Point" },
  { type: "model3d", label: "Model 3D" },
  { type: "linestring", label: "LineString" },
  { type: "polygon", label: "Polygon" },
  { type: "multipolygon", label: "MultiPolygon" },
];
const VIRTUAL_ROW_HEIGHT = 58;
const VIRTUAL_OVERSCAN = 6;
const VIRTUAL_VISIBLE_ROWS = 18;

function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function toFormState(feature: IndependentEntityFeature): FormState {
  return {
    name: feature.properties.name,
    modelUrl: feature.properties.modelUrl ?? "",
    styleText: toPrettyJson(feature.properties.style ?? {}),
    metadataText: toPrettyJson(feature.properties.metadata ?? {}),
    coordinatesText: JSON.stringify(feature.geometry.coordinates, null, 2),
    coordinateZ:
      feature.geometry.type === "Point"
        ? String(feature.geometry.coordinates[2] ?? 0)
        : "0",
    flatWidth: String(
      feature.properties.style?.flatWidth ??
        feature.properties.style?.width ??
        4,
    ),
    pipeWidth: String(
      feature.properties.style?.pipeWidth ??
        feature.properties.style?.width ??
        2,
    ),
    scale: String(getIndependentModelScale(feature.properties.scale)),
    heading: String(feature.properties.rotation?.heading ?? 0),
    tilt: String(feature.properties.rotation?.tilt ?? 0),
    roll: String(feature.properties.rotation?.roll ?? 0),
  };
}

function parseJsonRecord(value: string, fieldName: string) {
  const parsed = JSON.parse(value) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function parseJsonArray(value: string, fieldName: string) {
  const parsed = JSON.parse(value) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON array.`);
  }

  return parsed;
}

function parseNumber(value: string, fieldName: string) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName} must be a number.`);
  }

  return numberValue;
}

function parsePositiveNumber(value: string, fieldName: string) {
  const numberValue = parseNumber(value, fieldName);

  if (numberValue <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }

  return numberValue;
}

function updateStyleText(
  styleText: string,
  updater: (style: Record<string, unknown>) => Record<string, unknown>,
) {
  try {
    const parsed = parseJsonRecord(styleText, "style");
    return JSON.stringify(updater(parsed), null, 2);
  } catch {
    return styleText;
  }
}

function getPointCoordinateZText(coordinatesText: string) {
  try {
    const parsed = JSON.parse(coordinatesText) as unknown;

    if (!Array.isArray(parsed)) {
      return null;
    }

    const z = Number(parsed[2] ?? 0);
    return Number.isFinite(z) ? String(z) : null;
  } catch {
    return null;
  }
}

function updatePointZInCoordinatesText(coordinatesText: string, zText: string) {
  try {
    const parsed = JSON.parse(coordinatesText) as unknown;
    const nextZ = Number(zText);

    if (!Array.isArray(parsed) || parsed.length < 2 || !Number.isFinite(nextZ)) {
      return coordinatesText;
    }

    const nextCoordinates = [...parsed];
    nextCoordinates[2] = nextZ;

    return JSON.stringify(nextCoordinates, null, 2);
  } catch {
    return coordinatesText;
  }
}

function withCoordinates(
  feature: IndependentEntityFeature,
  coordinates: unknown[],
): IndependentEntityFeature {
  switch (feature.geometry.type) {
    case "Point":
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: coordinates as GeoJsonPosition,
        },
      };
    case "LineString":
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: coordinates as GeoJsonPosition[],
        },
      };
    case "Polygon":
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: coordinates as GeoJsonPosition[][],
        },
      };
    case "MultiPolygon":
      return {
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: coordinates as GeoJsonPosition[][][],
        },
      };
  }
}

function buildFeatureFromForm(
  feature: IndependentEntityFeature,
  form: FormState,
) {
  const coordinates = parseJsonArray(form.coordinatesText, "coordinates");
  const parsedStyle = parseJsonRecord(form.styleText, "style");
  const style =
    feature.geometry.type === "LineString"
      ? {
          ...parsedStyle,
          flatWidth: parsePositiveNumber(form.flatWidth, "flat width"),
          pipeWidth: parsePositiveNumber(form.pipeWidth, "pipe width"),
          width: parsePositiveNumber(form.pipeWidth, "pipe width"),
          profile: "circle",
        }
      : parsedStyle;
  const metadata = parseJsonRecord(form.metadataText, "metadata");
  let nextFeature = withCoordinates(feature, coordinates);
  const entityType = getIndependentEntityType(feature);

  if (nextFeature.geometry.type === "Point") {
    const [longitude, latitude] = nextFeature.geometry.coordinates;

    nextFeature = {
      ...nextFeature,
      geometry: {
        ...nextFeature.geometry,
        coordinates: [
          longitude,
          latitude,
          parseNumber(form.coordinateZ, "z"),
        ],
      },
    };
  }

  return {
    ...nextFeature,
    properties: {
      ...nextFeature.properties,
      name: form.name.trim() || nextFeature.properties.name,
      style,
      metadata,
      ...(entityType === "model3d"
        ? {
            modelUrl: form.modelUrl.trim(),
            scale: parsePositiveNumber(form.scale, "scale"),
            rotation: {
              heading: parseNumber(form.heading, "rotation.heading"),
              tilt: parseNumber(form.tilt, "rotation.tilt"),
              roll: parseNumber(form.roll, "rotation.roll"),
            },
          }
        : {}),
    },
  };
}

function geometrySummary(feature: IndependentEntityFeature) {
  const geometry = feature.geometry;

  if (geometry.type === "Point") {
    const [longitude, latitude, z = 0] = geometry.coordinates;
    return `${longitude.toFixed(6)}, ${latitude.toFixed(6)}, z=${z}`;
  }

  if (geometry.type === "LineString") {
    return `${geometry.coordinates.length} vertices`;
  }

  if (geometry.type === "Polygon") {
    return `${geometry.coordinates.length} rings`;
  }

  return `${geometry.coordinates.length} polygons`;
}

function getIcon(type: IndependentEntityType) {
  if (type === "point") return <FiMapPin aria-hidden="true" />;
  if (type === "model3d") return <FiBox aria-hidden="true" />;
  return <FiMinus aria-hidden="true" />;
}

export function IndependentEntityManagerPanel({
  open,
  features,
  selectedEntityId,
  creationMode,
  creationDraft,
  isDetailOpen,
  isEditOpen,
  geometryEditingEntityId,
  onOpenChange,
  onStartCreate,
  onCancelCreation,
  onSelectEntity,
  onOpenEdit,
  onStartGeometryEdit,
  onConfirmGeometryEdit,
  onCancelGeometryEdit,
  onCloseDetail,
  onCloseEdit,
  onSaveDraft,
  onUpdateEntity,
  onDeleteEntity,
  readOnly = false,
}: IndependentEntityManagerPanelProps) {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const selectedFeature = features.find(
    (feature) => getIndependentEntityId(feature) === selectedEntityId,
  );
  const isGeometryEditing =
    geometryEditingEntityId !== null &&
    geometryEditingEntityId === selectedEntityId;
  const editTarget = creationDraft ?? (isEditOpen ? selectedFeature : null);
  const filteredFeatures = useMemo(
    () =>
      filterType === "all"
        ? features
        : features.filter(
            (feature) => getIndependentEntityType(feature) === filterType,
          ),
    [features, filterType],
  );
  const virtualStartIndex = Math.max(
    0,
    Math.floor(listScrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN,
  );
  const virtualEndIndex = Math.min(
    filteredFeatures.length,
    virtualStartIndex + VIRTUAL_VISIBLE_ROWS + VIRTUAL_OVERSCAN * 2,
  );
  const virtualFeatures = filteredFeatures.slice(
    virtualStartIndex,
    virtualEndIndex,
  );

  useEffect(() => {
    if (!editTarget) {
      setForm(null);
      setError(null);
      return;
    }

    setForm(toFormState(editTarget));
    setError(null);
  }, [editTarget]);

  async function handleSubmit() {
    if (readOnly) return;

    if (!editTarget || !form) return;

    setSaving(true);
    setError(null);

    try {
      const nextFeature = buildFeatureFromForm(editTarget, form);

      if (creationDraft) {
        await onSaveDraft(nextFeature);
      } else {
        await onUpdateEntity(nextFeature);
      }
    } catch (submitError: unknown) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(feature: IndependentEntityFeature) {
    if (readOnly) return;

    const confirmed = window.confirm(`Delete "${feature.properties.name}"?`);

    if (!confirmed) return;

    setSaving(true);
    setError(null);

    try {
      await onDeleteEntity(feature);
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="absolute right-4 top-[7.5rem] z-20 inline-flex h-11 w-52 items-center justify-start gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 text-sm font-bold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-arcgis-blue hover:bg-white hover:text-arcgis-blue hover:shadow-xl active:translate-y-0"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-arcgis-blue text-white shadow-sm">
          <FiEye className="text-base" aria-hidden="true" />
        </span>
        Thực thể bản đồ
      </button>
    );
  }

  return (
    <aside className="absolute right-4 top-4 z-30 flex max-h-[calc(100vh-2rem)] w-[25rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">
            Independent Entities
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {features.length} features
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close independent entity panel"
          title="Close"
        >
          <FiX aria-hidden="true" />
        </button>
      </div>

      <div className="border-b border-slate-200 px-4 py-3">
        <div className="mb-3 grid grid-cols-3 gap-1">
          {FILTER_OPTIONS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`min-h-8 rounded-md border px-2 text-[0.7rem] font-semibold capitalize transition ${
                filterType === type
                  ? "border-arcgis-blue bg-arcgis-blue text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-arcgis-blue hover:text-arcgis-blue"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <div hidden={readOnly} className="grid grid-cols-2 gap-2">
          {CREATE_OPTIONS.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => onStartCreate(option.type)}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-2 text-[0.72rem] font-bold text-white transition hover:bg-arcgis-blue"
            >
              <FiPlus aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>

        {readOnly ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            WEB mode: entities are read-only.
          </p>
        ) : null}

        {creationMode !== "idle" ? (
          <div className="mt-3 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <span>{creationMode}</span>
            <button
              type="button"
              onClick={onCancelCreation}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 text-[0.7rem] text-amber-800"
            >
              <FiX aria-hidden="true" />
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto p-3"
        onScroll={(event) => setListScrollTop(event.currentTarget.scrollTop)}
      >
        <div
          className="relative"
          style={{
            height: Math.max(
              filteredFeatures.length * VIRTUAL_ROW_HEIGHT,
              VIRTUAL_ROW_HEIGHT,
            ),
          }}
        >
          {virtualFeatures.map((feature, index) => {
            const id = getIndependentEntityId(feature);
            const type = getIndependentEntityType(feature);
            const selected = id === selectedEntityId;
            const absoluteIndex = virtualStartIndex + index;

            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectEntity(feature)}
                style={{
                  height: VIRTUAL_ROW_HEIGHT - 8,
                  top: absoluteIndex * VIRTUAL_ROW_HEIGHT,
                }}
                className={`absolute left-0 right-0 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                  selected
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-white hover:border-arcgis-blue hover:bg-slate-50"
                }`}
              >
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
                  {getIcon(type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-800">
                    {feature.properties.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.7rem] font-medium text-slate-500">
                    {type} / {id}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {isDetailOpen && selectedFeature ? (
        <section className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-800">
                {selectedFeature.properties.name}
              </h3>
              <p className="text-[0.7rem] font-semibold text-slate-500">
                {getIndependentEntityType(selectedFeature)}
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDetail}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500"
              aria-label="Close detail"
              title="Close"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>
          <dl className="space-y-2 text-xs">
            <div>
              <dt className="font-bold uppercase text-slate-400">ID</dt>
              <dd className="break-all font-semibold text-slate-700">
                {getIndependentEntityId(selectedFeature)}
              </dd>
            </div>
            <div>
              <dt className="font-bold uppercase text-slate-400">Geometry</dt>
              <dd className="font-semibold text-slate-700">
                {geometrySummary(selectedFeature)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onOpenEdit}
              hidden={readOnly}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-arcgis-blue px-3 py-2 text-xs font-bold text-white"
            >
              <FiEdit2 aria-hidden="true" />
              Edit
            </button>
            {selectedFeature.geometry.type !== "Point" ? (
              <button
                type="button"
                onClick={() => void onStartGeometryEdit(selectedFeature)}
                hidden={readOnly}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700"
              >
                <FiMove aria-hidden="true" />
                Edit map
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDelete(selectedFeature)}
              hidden={readOnly}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700"
            >
              <FiTrash2 aria-hidden="true" />
              Delete
            </button>
          </div>
          {isGeometryEditing ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
              <p className="mb-2 text-xs font-semibold text-amber-800">
                Editing geometry on map
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void onConfirmGeometryEdit()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 py-2 text-xs font-bold text-white"
                >
                  <FiSave aria-hidden="true" />
                  Save map edit
                </button>
                <button
                  type="button"
                  onClick={() => void onCancelGeometryEdit()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-800"
                >
                  <FiX aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!readOnly && isEditOpen && editTarget && form ? (
        <section className="max-h-[70vh] overflow-auto border-t border-slate-200 bg-white px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">
              {creationDraft ? "Create entity" : "Edit entity"}
            </h3>
            <button
              type="button"
              onClick={creationDraft ? onCancelCreation : onCloseEdit}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500"
              aria-label="Close edit"
              title="Close"
            >
              <FiX aria-hidden="true" />
            </button>
          </div>

          {error ? (
            <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                Name
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
              />
            </label>

            {getIndependentEntityType(editTarget) === "model3d" ? (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                    Model URL
                  </span>
                  <input
                    value={form.modelUrl}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, modelUrl: event.target.value }
                          : current,
                      )
                    }
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                    Z / Elevation
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    value={form.coordinateZ}
                    onChange={(event) => {
                      const nextZ = event.target.value;

                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              coordinateZ: nextZ,
                              coordinatesText: updatePointZInCoordinatesText(
                                current.coordinatesText,
                                nextZ,
                              ),
                            }
                          : current,
                      );
                    }}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                    Scale
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={form.scale}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, scale: event.target.value }
                          : current,
                      )
                    }
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["heading", "tilt", "roll"] as const).map((key) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                        {key}
                      </span>
                      <input
                        value={form[key]}
                        onChange={(event) =>
                          setForm((current) =>
                            current
                              ? { ...current, [key]: event.target.value }
                              : current,
                          )
                        }
                        className="h-9 w-full rounded-md border border-slate-200 px-2 text-xs font-semibold outline-none focus:border-arcgis-blue"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {editTarget.geometry.type === "Point" &&
            getIndependentEntityType(editTarget) !== "model3d" ? (
              <label className="block">
                <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                  Z / Elevation
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={form.coordinateZ}
                  onChange={(event) => {
                    const nextZ = event.target.value;

                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            coordinateZ: nextZ,
                            coordinatesText: updatePointZInCoordinatesText(
                              current.coordinatesText,
                              nextZ,
                            ),
                          }
                        : current,
                    );
                  }}
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                />
              </label>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                Coordinates
              </span>
              <textarea
                value={form.coordinatesText}
                onChange={(event) =>
                  setForm((current) => {
                    if (!current) {
                      return current;
                    }

                    const coordinatesText = event.target.value;
                    const coordinateZ =
                      editTarget.geometry.type === "Point"
                        ? getPointCoordinateZText(coordinatesText)
                        : null;

                    return {
                      ...current,
                      coordinatesText,
                      coordinateZ: coordinateZ ?? current.coordinateZ,
                    };
                  })
                }
                rows={5}
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 font-mono text-[0.72rem] outline-none focus:border-arcgis-blue"
              />
            </label>

            {editTarget.geometry.type === "LineString" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                    Flat width (px)
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={form.flatWidth}
                    onChange={(event) => {
                      const nextWidth = event.target.value;

                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              flatWidth: nextWidth,
                              styleText: updateStyleText(
                                current.styleText,
                                (style) => ({
                                  ...style,
                                  flatWidth: Number(nextWidth),
                                }),
                              ),
                            }
                          : current,
                      );
                    }}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                    Pipe diameter (m)
                  </span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={form.pipeWidth}
                    onChange={(event) => {
                      const nextWidth = event.target.value;

                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              pipeWidth: nextWidth,
                              styleText: updateStyleText(
                                current.styleText,
                                (style) => ({
                                  ...style,
                                  width: Number(nextWidth),
                                  pipeWidth: Number(nextWidth),
                                  profile: "circle",
                                }),
                              ),
                            }
                          : current,
                      );
                    }}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs font-semibold outline-none focus:border-arcgis-blue"
                  />
                </label>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                Style
              </span>
              <textarea
                value={form.styleText}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, styleText: event.target.value }
                      : current,
                  )
                }
                rows={4}
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 font-mono text-[0.72rem] outline-none focus:border-arcgis-blue"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[0.7rem] font-bold uppercase text-slate-500">
                Metadata
              </span>
              <textarea
                value={form.metadataText}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, metadataText: event.target.value }
                      : current,
                  )
                }
                rows={4}
                className="w-full resize-y rounded-md border border-slate-200 px-3 py-2 font-mono text-[0.72rem] outline-none focus:border-arcgis-blue"
              />
            </label>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit()}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-arcgis-blue px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiSave aria-hidden="true" />
              Save
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={creationDraft ? onCancelCreation : onCloseEdit}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FiX aria-hidden="true" />
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
