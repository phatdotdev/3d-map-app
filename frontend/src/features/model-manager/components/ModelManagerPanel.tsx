import { useEffect, useRef, useState } from "react";
import {
  FiBox,
  FiEye,
  FiRefreshCw,
  FiScissors,
  FiTrash2,
  FiUpload,
  FiX,
} from "react-icons/fi";

import { isWebMode } from "../../../config/runtime";
import {
  deleteModel,
  fetchModels,
  splitModel,
  uploadModel,
} from "../../../services/api/modelApi";
import type {
  ModelRegistryEntry,
  ModelSplitResponse,
} from "../types/modelRegistry";

type ModelManagerPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectModel: (model: ModelRegistryEntry) => void;
  onModelSplit?: (
    model: ModelRegistryEntry,
    splitResult: ModelSplitResponse,
  ) => Promise<void> | void;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ModelManagerPanel({
  open,
  onOpenChange,
  onSelectModel,
  onModelSplit,
}: ModelManagerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = isWebMode();

  async function reload() {
    setLoading(true);
    setError(null);

    try {
      setModels(await fetchModels());
    } catch (loadError: unknown) {
      setError(toErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open]);

  async function handleUpload(file: File | null) {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      await uploadModel(file);
      await reload();
    } catch (uploadError: unknown) {
      setError(toErrorMessage(uploadError));
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleSplit(model: ModelRegistryEntry) {
    setBusyModelId(model.id);
    setError(null);

    try {
      const result = await splitModel(model.id);
      await onModelSplit?.(model, result);
      await reload();
    } catch (splitError: unknown) {
      setError(toErrorMessage(splitError));
    } finally {
      setBusyModelId(null);
    }
  }

  async function handleDelete(model: ModelRegistryEntry) {
    if (!window.confirm(`Delete model "${model.name}"?`)) return;

    setBusyModelId(model.id);
    setError(null);

    try {
      await deleteModel(model.id);
      await reload();
    } catch (deleteError: unknown) {
      setError(toErrorMessage(deleteError));
    } finally {
      setBusyModelId(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="absolute left-4 top-[4.25rem] z-20 inline-flex h-11 w-44 items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white/95 px-3.5 text-sm font-bold text-slate-700 shadow-lg shadow-slate-900/10 backdrop-blur-md transition hover:border-arcgis-blue hover:text-arcgis-blue"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <FiBox aria-hidden="true" />
        </span>
        Models
      </button>
    );
  }

  return (
    <aside className="absolute left-4 top-4 z-30 flex max-h-[calc(100vh-2rem)] w-[22rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm text-slate-800 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Model Manager</h2>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {models.length} models
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!readOnly ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                className="hidden"
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-arcgis-blue text-white"
                title="Upload model"
                aria-label="Upload model"
              >
                <FiUpload aria-hidden="true" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
            title="Reload"
            aria-label="Reload models"
          >
            <FiRefreshCw aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500"
            title="Close"
            aria-label="Close model manager"
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {readOnly ? (
          <p className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            WEB mode: model registry is read-only.
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Loading models...
          </p>
        ) : null}

        {error ? (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          {models.map((model) => (
            <article
              key={model.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <FiBox aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-xs font-bold text-slate-800">
                    {model.name}
                  </h3>
                  <p className="mt-0.5 break-all text-[0.68rem] font-semibold text-slate-500">
                    {model.url}
                  </p>
                  {model.split?.enabled ? (
                    <p className="mt-1 text-[0.68rem] font-bold text-emerald-700">
                      Split manifest ready - can split again
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex gap-1.5">
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => onSelectModel(model)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-arcgis-blue px-2 py-2 text-[0.7rem] font-bold text-white"
                  >
                    <FiEye aria-hidden="true" />
                    Use
                  </button>
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    disabled={busyModelId === model.id}
                    onClick={() => void handleSplit(model)}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[0.7rem] font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FiScissors aria-hidden="true" />
                    {model.split?.enabled ? "Split again" : "Split"}
                  </button>
                ) : null}
                {!readOnly ? (
                  <button
                    type="button"
                    disabled={busyModelId === model.id}
                    onClick={() => void handleDelete(model)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Delete"
                    aria-label="Delete model"
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </aside>
  );
}
