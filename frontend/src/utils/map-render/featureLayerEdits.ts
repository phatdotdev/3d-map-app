import Graphic from "@arcgis/core/Graphic";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";

const layerEditQueues = new WeakMap<FeatureLayer, Promise<unknown>>();

type QueryAllFeatureLayerFeaturesOptions = {
  returnGeometry?: boolean;
  outFields?: string[];
};

export function enqueueFeatureLayerEdit<T>(
  layer: FeatureLayer,
  edit: () => Promise<T>,
) {
  const previousEdit = layerEditQueues.get(layer) ?? Promise.resolve();
  const nextEdit = previousEdit.catch(() => undefined).then(edit);

  layerEditQueues.set(layer, nextEdit.catch(() => undefined));

  return nextEdit;
}

export async function queryAllFeatureLayerFeatures(
  layer: FeatureLayer,
  options: QueryAllFeatureLayerFeaturesOptions = {},
) {
  await layer.load();

  const featureSet = await layer.queryFeatures({
    where: "1=1",
    returnGeometry: options.returnGeometry ?? true,
    outFields: options.outFields ?? ["*"],
  });

  return featureSet.features;
}

export async function queryNextFeatureLayerObjectId(layer: FeatureLayer) {
  const objectIdField = layer.objectIdField || "OBJECTID";
  const features = await queryAllFeatureLayerFeatures(layer, {
    returnGeometry: false,
    outFields: [objectIdField],
  });

  return (
    features.reduce((maxObjectId, feature) => {
      const featureObjectId = Number(feature.attributes?.[objectIdField] ?? 0);
      return Math.max(maxObjectId, featureObjectId);
    }, 0) + 1
  );
}

export async function replaceFeatureLayerFeatures(
  layer: FeatureLayer,
  graphics: Graphic[],
) {
  await enqueueFeatureLayerEdit(layer, async () => {
    const existingFeatures = await queryAllFeatureLayerFeatures(layer);

    if (existingFeatures.length === 0 && graphics.length === 0) {
      return;
    }

    await layer.applyEdits({
      deleteFeatures: existingFeatures,
      addFeatures: graphics,
    });
  });
}

export async function clearFeatureLayerFeatures(layer: FeatureLayer | null) {
  if (!layer) return;

  await enqueueFeatureLayerEdit(layer, async () => {
    const existingFeatures = await queryAllFeatureLayerFeatures(layer);

    if (existingFeatures.length === 0) {
      return;
    }

    await layer.applyEdits({
      deleteFeatures: existingFeatures,
    });
  });
}
