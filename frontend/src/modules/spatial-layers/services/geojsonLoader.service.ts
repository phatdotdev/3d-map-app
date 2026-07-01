import type { GeoJSONFeatureCollection } from "../types/geojson.types";

function isFeatureCollection(value: unknown): value is GeoJSONFeatureCollection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<GeoJSONFeatureCollection>;
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

export async function loadGeoJson(
  sourcePath: string,
): Promise<GeoJSONFeatureCollection> {
  let response: Response;

  try {
    response = await fetch(sourcePath);
  } catch (error) {
    throw new Error(
      `Cannot fetch GeoJSON from ${sourcePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      {
        cause: error,
      },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Cannot load GeoJSON ${sourcePath} (${response.status} ${response.statusText}).`,
    );
  }

  const data: unknown = await response.json();

  if (!isFeatureCollection(data)) {
    throw new Error(`GeoJSON ${sourcePath} is not a FeatureCollection.`);
  }

  return data;
}
