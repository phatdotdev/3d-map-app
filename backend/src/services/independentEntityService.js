const { independentEntitiesFile } = require("../config/paths");
const {
  readFeatureCollection,
  writeFeatureCollection,
} = require("../repositories/geoJsonRepository");
const { isGeometryInBbox, parseBbox } = require("../utils/bbox");
const { HttpError } = require("../utils/httpError");
const {
  assertIndependentEntityFeature,
  assertIndependentEntityPayload,
} = require("../validators/entityValidator");
const { isRecord } = require("../validators/spatialLayerValidator");

function toProperties(feature) {
  return isRecord(feature.properties) ? feature.properties : {};
}

function getFeatureId(feature) {
  const properties = toProperties(feature);
  return String(properties.id ?? feature.id ?? "");
}

function toPositiveFiniteNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function getModelScale(properties, legacyModel) {
  const scale = properties.scale;

  if (isRecord(scale)) {
    return toPositiveFiniteNumber(
      scale.z ?? scale.x ?? scale.y,
      toPositiveFiniteNumber(
        legacyModel.scale ?? legacyModel.height ?? legacyModel.width ?? legacyModel.depth,
        20,
      ),
    );
  }

  return toPositiveFiniteNumber(
    scale,
    toPositiveFiniteNumber(
      legacyModel.scale ?? legacyModel.height ?? legacyModel.width ?? legacyModel.depth,
      20,
    ),
  );
}

function toEntity(feature) {
  const geometry = isRecord(feature.geometry) ? feature.geometry : null;

  if (geometry?.type !== "Point" || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const properties = toProperties(feature);
  const style = isRecord(properties.style) ? properties.style : {};
  const legacyPin = isRecord(properties.pin) ? properties.pin : {};
  const legacyModel = isRecord(properties.model3D) ? properties.model3D : {};
  const rotation = isRecord(properties.rotation) ? properties.rotation : {};
  const id = String(properties.id ?? feature.id ?? "");
  const entityType = String(properties.entityType ?? "model3d").toLowerCase();
  const isModel = entityType === "model3d";
  const [longitude, latitude, z = 0] = geometry.coordinates;

  return {
    id,
    name: String(properties.name ?? id),
    type: isModel ? "model3d" : "point",
    longitude: Number(longitude ?? 0),
    latitude: Number(latitude ?? 0),
    z: Number(z ?? 0),
    metadata: isRecord(properties.metadata) ? properties.metadata : undefined,
    source: {
      kind: "independent",
    },
    pin: {
      enabled: true,
      color: String(style.pinColor ?? style.color ?? legacyPin.color ?? "#ef4444"),
      size: Number(style.pinSize ?? style.size ?? legacyPin.size ?? 32),
      iconUrl: String(style.iconUrl ?? legacyPin.iconUrl ?? "/icons/map-pin.svg"),
      showAtScale: legacyPin.showAtScale,
    },
    model3D: isModel
      ? {
          enabled: true,
          url: String(properties.modelUrl ?? legacyModel.url ?? ""),
          scale: getModelScale(properties, legacyModel),
          heading: Number(rotation.heading ?? legacyModel.heading ?? 0),
          tilt: Number(rotation.tilt ?? legacyModel.tilt ?? 0),
          roll: Number(rotation.roll ?? legacyModel.roll ?? 0),
          showModelAtScale: legacyModel.showModelAtScale,
        }
      : undefined,
  };
}

function toEntityList(features) {
  return features
    .map((feature) => toEntity(feature))
    .filter((entity) => entity !== null);
}

function normalizeStoredFeature(feature) {
  return assertIndependentEntityFeature({
    ...feature,
    type: "Feature",
  });
}

function normalizeCollection(collection) {
  return {
    ...collection,
    features: collection.features.map(normalizeStoredFeature),
  };
}

function findEntityIndex(collection, entityId) {
  return collection.features.findIndex((feature) => getFeatureId(feature) === entityId);
}

function withRouteId(feature, entityId) {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      id: entityId,
    },
  };
}

function createListResponse(features) {
  return {
    features,
    entities: toEntityList(features),
  };
}

async function readNormalizedCollection() {
  const collection = await readFeatureCollection(independentEntitiesFile);
  return normalizeCollection(collection);
}

async function listIndependentEntities(query = {}) {
  const bbox = parseBbox(query.bbox);
  const collection = await readNormalizedCollection();
  const features = collection.features.filter((feature) =>
    isGeometryInBbox(feature.geometry, bbox),
  );

  return createListResponse(features);
}

async function getIndependentEntity(entityId) {
  if (!entityId) {
    throw new HttpError(400, "Missing entity id.");
  }

  const collection = await readNormalizedCollection();
  const feature = collection.features.find((candidate) => getFeatureId(candidate) === entityId);

  if (!feature) {
    throw new HttpError(404, "Entity was not found.");
  }

  return {
    feature,
    entity: toEntity(feature),
  };
}

async function createIndependentEntity(payload) {
  const feature = assertIndependentEntityPayload(payload);
  const collection = await readNormalizedCollection();
  const entityId = getFeatureId(feature);

  if (findEntityIndex(collection, entityId) >= 0) {
    throw new HttpError(409, "Entity id already exists.");
  }

  const nextCollection = await writeFeatureCollection(independentEntitiesFile, {
    ...collection,
    features: [...collection.features, feature],
  });

  return {
    feature,
    entity: toEntity(feature),
    total: nextCollection.features.length,
  };
}

async function updateIndependentEntity(entityId, payload) {
  if (!entityId) {
    throw new HttpError(400, "Missing entity id.");
  }

  const feature = withRouteId(assertIndependentEntityPayload(payload), entityId);
  const collection = await readNormalizedCollection();
  const entityIndex = findEntityIndex(collection, entityId);

  if (entityIndex < 0) {
    throw new HttpError(404, "Entity was not found.");
  }

  const nextFeatures = [...collection.features];
  nextFeatures[entityIndex] = feature;

  await writeFeatureCollection(independentEntitiesFile, {
    ...collection,
    features: nextFeatures,
  });

  return {
    feature,
    entity: toEntity(feature),
  };
}

async function deleteIndependentEntity(entityId) {
  if (!entityId) {
    throw new HttpError(400, "Missing entity id.");
  }

  const collection = await readNormalizedCollection();
  const nextFeatures = collection.features.filter(
    (feature) => getFeatureId(feature) !== entityId,
  );

  if (nextFeatures.length === collection.features.length) {
    throw new HttpError(404, "Entity was not found.");
  }

  await writeFeatureCollection(independentEntitiesFile, {
    ...collection,
    features: nextFeatures,
  });

  return {
    id: entityId,
  };
}

module.exports = {
  createIndependentEntity,
  deleteIndependentEntity,
  getIndependentEntity,
  listIndependentEntities,
  updateIndependentEntity,
};
