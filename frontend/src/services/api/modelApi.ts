import { ensureAppMode, isWebMode } from "../../config/runtime";
import { staticAssetEntityDataSource } from "../data-source/StaticAssetEntityDataSource";
import { apiRequest } from "./client";
import type {
  ModelRegistryEntry,
  ModelSplitResponse,
} from "../../features/model-manager/types/modelRegistry";

type ModelListResponse = {
  models: ModelRegistryEntry[];
};

type ModelResponse = {
  model: ModelRegistryEntry;
};

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read file."));
    reader.readAsDataURL(file);
  });
}

export async function fetchModels() {
  if (isWebMode()) {
    const catalog = await staticAssetEntityDataSource.getCatalog();
    const response = await fetch(catalog.modelRegistry);

    if (!response.ok) {
      throw new Error("Cannot load static model registry.");
    }

    return (await response.json()) as ModelRegistryEntry[];
  }

  const response = await apiRequest<ModelListResponse>("/models");
  return response.models;
}

export async function uploadModel(file: File, name?: string) {
  ensureAppMode("Upload model");

  const response = await apiRequest<ModelResponse>("/models/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fileName: file.name,
      name: name || file.name.replace(/\.[^.]+$/, ""),
      contentBase64: await fileToDataUrl(file),
      metadata: {
        source: "user-upload",
      },
    }),
  });

  return response.model;
}

export async function splitModel(modelId: string) {
  ensureAppMode("Split model");

  return apiRequest<ModelSplitResponse>(
    `/models/${encodeURIComponent(modelId)}/split`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ strategy: "by-node", force: true }),
    },
  );
}

export async function deleteModel(modelId: string) {
  ensureAppMode("Xoa model");

  await apiRequest<{ id: string }>(`/models/${encodeURIComponent(modelId)}`, {
    method: "DELETE",
  });
}
