import type { MapPoint3D } from "../../features/map/types/mapPoint";
import {
  toMapPoint3DList,
  type IndependentEntityFeature,
} from "../../features/map/types/independentEntity";
import { ensureAppMode, isWebMode } from "../../config/runtime";
import type {
  ModelBounds,
  ModelRegistryEntry,
  ModelSplitPart,
} from "../../features/model-manager/types/modelRegistry";
import { staticAssetEntityDataSource } from "../data-source/StaticAssetEntityDataSource";
import { apiRequest } from "./client";
import { fetchModels } from "./modelApi";

type EntityListResponse = {
  entities?: MapPoint3D[];
  features?: IndependentEntityFeature[];
};

type EntityResponse = {
  entity?: MapPoint3D | null;
  feature?: IndependentEntityFeature;
};

type ModelSplitManifest = {
  parent?: {
    bounds?: ModelBounds;
  };
  parts?: ModelSplitPart[];
};

const splitManifestCache = new Map<string, Promise<ModelSplitManifest>>();

function normalizeUrl(value: string | undefined) {
  return String(value ?? "").trim();
}

async function fetchSplitManifest(manifestUrl: string) {
  const normalizedManifestUrl = normalizeUrl(manifestUrl);

  if (!normalizedManifestUrl) {
    return {};
  }

  if (!splitManifestCache.has(normalizedManifestUrl)) {
    splitManifestCache.set(
      normalizedManifestUrl,
      fetch(normalizedManifestUrl)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Cannot load split manifest ${normalizedManifestUrl}.`);
          }

          return (await response.json()) as ModelSplitManifest;
        })
        .catch((error: unknown) => {
          console.warn("Cannot load split model manifest:", error);
          return {};
        }),
    );
  }

  return splitManifestCache.get(normalizedManifestUrl)!;
}

function findSplitModelForFeature(
  feature: IndependentEntityFeature,
  models: ModelRegistryEntry[],
) {
  const modelId = normalizeUrl(feature.properties.modelId);
  const modelUrl = normalizeUrl(feature.properties.modelUrl);

  return models.find((model) => {
    return (
      (modelId && model.id === modelId) ||
      (modelUrl && normalizeUrl(model.url) === modelUrl)
    );
  });
}

function splitChildrenHaveBounds(
  split: IndependentEntityFeature["properties"]["split"],
) {
  return Boolean(
    split?.parentBounds &&
      split.children?.length &&
      split.children.every((child) => child.metadata?.bounds),
  );
}

export async function loadSplitForIndependentFeature(
  feature: IndependentEntityFeature,
) {
  if (feature.properties.entityType !== "model3d") {
    return feature;
  }

  const currentSplit = feature.properties.split;

  if (currentSplit?.enabled && splitChildrenHaveBounds(currentSplit)) {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        split: {
          ...currentSplit,
          renderMode: "children",
        },
      },
    } satisfies IndependentEntityFeature;
  }

  let models: ModelRegistryEntry[] = [];
  try {
    models = await fetchModels();
  } catch (error: unknown) {
    console.warn("Cannot load model registry for split rendering:", error);
  }

  const model = findSplitModelForFeature(feature, models);
  const manifestUrl = currentSplit?.manifestUrl ?? model?.split?.manifestUrl;

  if (!manifestUrl) {
    throw new Error("Split manifest is not available for this model.");
  }

  const manifest = await fetchSplitManifest(manifestUrl);
  const parts = manifest.parts ?? [];

  if (parts.length === 0) {
    throw new Error("Split manifest does not contain any model parts.");
  }

  const currentChildrenById = new Map(
    (currentSplit?.children ?? []).map((child) => [child.id, child]),
  );

  return {
    ...feature,
    properties: {
      ...feature.properties,
      modelId: feature.properties.modelId || model?.id,
      modelUrl: feature.properties.modelUrl || model?.url,
      split: {
        enabled: true,
        renderMode: "children",
        manifestUrl,
        parentBounds: manifest.parent?.bounds,
        children: parts.map((part) => ({
          id: part.id,
          name: part.name,
          modelUrl: part.url,
          visible:
            currentChildrenById.get(part.id)?.visible ?? (part.visible !== false),
          transformMode: "inherit-parent",
          metadata: part.metadata,
        })),
      },
    },
  } satisfies IndependentEntityFeature;
}

export async function fetchIndependentEntities() {
  const response = await apiRequest<EntityListResponse>("/independent-entities");
  return response.entities ?? toMapPoint3DList(response.features ?? []);
}

export async function fetchIndependentEntityFeatures(params?: {
  bbox?: string;
  scale?: number;
}) {
  let features: IndependentEntityFeature[] = [];

  if (isWebMode()) {
    features = await staticAssetEntityDataSource.getIndependentEntities(params);
    return features;
  }

  const searchParams = new URLSearchParams();

  if (params?.bbox) {
    searchParams.set("bbox", params.bbox);
  }

  if (params?.scale !== undefined) {
    searchParams.set("scale", String(params.scale));
  }

  const query = searchParams.toString();
  const response = await apiRequest<EntityListResponse>(
    `/independent-entities${query ? `?${query}` : ""}`,
  );

  features = response.features ?? [];
  return features;
}

export async function fetchIndependentEntityById(entityId: string) {
  ensureAppMode("Doc entity theo API");

  const response = await apiRequest<EntityResponse>(
    `/independent-entities/${encodeURIComponent(entityId)}`,
  );

  return response.feature ?? null;
}

export async function createIndependentEntity(feature: IndependentEntityFeature) {
  ensureAppMode("Tao entity");

  const response = await apiRequest<EntityResponse>("/independent-entities", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ feature }),
  });

  return response.feature;
}

export async function updateIndependentEntityFeature(
  feature: IndependentEntityFeature,
) {
  ensureAppMode("Cap nhat entity");

  const response = await apiRequest<EntityResponse>(
    `/independent-entities/${encodeURIComponent(feature.properties.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ feature }),
    },
  );

  return response.feature;
}

export async function updateIndependentEntity(entity: MapPoint3D) {
  ensureAppMode("Cap nhat entity");

  const response = await apiRequest<EntityResponse>(
    `/independent-entities/${encodeURIComponent(entity.id)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ entity }),
    },
  );

  if (response.entity) {
    return response.entity;
  }

  const points = response.feature ? toMapPoint3DList([response.feature]) : [];
  return points[0] ?? entity;
}

export async function deleteIndependentEntity(entityId: string) {
  ensureAppMode("Xoa entity");

  await apiRequest<{ id: string }>(
    `/independent-entities/${encodeURIComponent(entityId)}`,
    {
      method: "DELETE",
    },
  );
}
