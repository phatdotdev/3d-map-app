import type ArcGISMap from "@arcgis/core/Map";
import type Layer from "@arcgis/core/layers/Layer";

export function findLayerById(
  map: ArcGISMap,
  layerId: string,
): Layer | null {
  return map.findLayerById(layerId) ?? null;
}

export function addSpatialLayerToMap(
  map: ArcGISMap,
  layer: Layer,
): void {
  const existingLayer = findLayerById(map, layer.id);

  if (existingLayer && existingLayer !== layer) {
    map.remove(existingLayer);
  }

  if (!findLayerById(map, layer.id)) {
    map.add(layer);
  }
}

export function removeSpatialLayerFromMap(
  map: ArcGISMap,
  layerId: string,
): void {
  const layer = findLayerById(map, layerId);

  if (layer) {
    map.remove(layer);
  }
}

export function setSpatialLayerVisible(
  map: ArcGISMap,
  layerId: string,
  visible: boolean,
): void {
  const layer = findLayerById(map, layerId);

  if (layer) {
    layer.visible = visible;
  }
}

export function clearSpatialLayers(
  map: ArcGISMap,
  layerIds: string[],
): void {
  layerIds.forEach((layerId) => {
    removeSpatialLayerFromMap(map, layerId);
  });
}
