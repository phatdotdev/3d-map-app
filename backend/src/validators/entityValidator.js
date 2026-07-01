const { HttpError } = require("../utils/httpError");
const { isRecord } = require("./spatialLayerValidator");

const SUPPORTED_ENTITY_TYPES = new Set([
  "point",
  "model3d",
  "linestring",
  "polygon",
  "multipolygon",
]);

const ENTITY_TYPE_BY_GEOMETRY = {
  Point: "point",
  LineString: "linestring",
  Polygon: "polygon",
  MultiPolygon: "multipolygon",
};

function toNumber(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    throw new HttpError(400, `${fieldName} must be a number.`);
  }

  return numberValue;
}

function toPositiveNumber(value, fieldName) {
  const numberValue = toNumber(value, fieldName);

  if (numberValue <= 0) {
    throw new HttpError(400, `${fieldName} must be greater than 0.`);
  }

  return numberValue;
}

function optionalRecord(value) {
  return isRecord(value) ? value : {};
}

function assertPosition(value, fieldName) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new HttpError(400, `${fieldName} must be [longitude, latitude, z?].`);
  }

  const longitude = toNumber(value[0], `${fieldName}[0]`);
  const latitude = toNumber(value[1], `${fieldName}[1]`);
  const z = value[2] === undefined ? 0 : toNumber(value[2], `${fieldName}[2]`);

  return [longitude, latitude, z];
}

function positionsEqual(first, second) {
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2];
}

function closeRing(ring) {
  if (ring.length === 0) {
    return ring;
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (positionsEqual(first, last)) {
    return ring;
  }

  return [...ring, [...first]];
}

function uniqueHorizontalVertexCount(ring) {
  const uniqueKeys = new Set(
    ring.map((position) => `${position[0].toFixed(12)},${position[1].toFixed(12)}`),
  );

  return uniqueKeys.size;
}

function assertLineStringCoordinates(value) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "LineString coordinates must be an array.");
  }

  const coordinates = value.map((position, index) =>
    assertPosition(position, `coordinates[${index}]`),
  );

  if (coordinates.length < 2) {
    throw new HttpError(400, "LineString requires at least two positions.");
  }

  return coordinates;
}

function assertPolygonRing(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${fieldName} must be an array of positions.`);
  }

  const ring = closeRing(
    value.map((position, index) => assertPosition(position, `${fieldName}[${index}]`)),
  );

  if (uniqueHorizontalVertexCount(ring) < 3) {
    throw new HttpError(400, "Polygon ring requires at least three unique positions.");
  }

  if (ring.length < 4) {
    throw new HttpError(400, "Polygon ring requires at least four positions.");
  }

  return ring;
}

function assertPolygonCoordinates(value, fieldName = "coordinates") {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "Polygon coordinates must include at least one ring.");
  }

  return value.map((ring, index) => assertPolygonRing(ring, `${fieldName}[${index}]`));
}

function assertMultiPolygonCoordinates(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, "MultiPolygon coordinates must include at least one polygon.");
  }

  return value.map((polygon, index) =>
    assertPolygonCoordinates(polygon, `coordinates[${index}]`),
  );
}

function normalizeGeometry(geometry) {
  if (!isRecord(geometry)) {
    throw new HttpError(400, "Entity geometry is required.");
  }

  switch (geometry.type) {
    case "Point":
      return {
        type: "Point",
        coordinates: assertPosition(geometry.coordinates, "coordinates"),
      };
    case "LineString":
      return {
        type: "LineString",
        coordinates: assertLineStringCoordinates(geometry.coordinates),
      };
    case "Polygon":
      return {
        type: "Polygon",
        coordinates: assertPolygonCoordinates(geometry.coordinates),
      };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: assertMultiPolygonCoordinates(geometry.coordinates),
      };
    default:
      throw new HttpError(400, "GeoJSON geometry type is not supported.");
  }
}

function inferEntityType(geometryType, properties) {
  const requestedType =
    typeof properties.entityType === "string"
      ? properties.entityType.toLowerCase()
      : undefined;
  const inferredType = ENTITY_TYPE_BY_GEOMETRY[geometryType];

  if (!requestedType) {
    return inferredType;
  }

  if (!SUPPORTED_ENTITY_TYPES.has(requestedType)) {
    throw new HttpError(400, "Entity type is not supported.");
  }

  if (geometryType === "Point" && (requestedType === "point" || requestedType === "model3d")) {
    return requestedType;
  }

  if (requestedType !== inferredType) {
    throw new HttpError(400, "Entity type does not match geometry type.");
  }

  return requestedType;
}

function normalizeScale(value, fallbackSize) {
  if (isRecord(value)) {
    return toPositiveNumber(
      value.z ?? value.x ?? value.y ?? fallbackSize,
      "scale",
    );
  }

  if (value !== undefined) {
    return toPositiveNumber(value, "scale");
  }

  return fallbackSize;
}

function normalizeRotation(value) {
  if (isRecord(value)) {
    const normalizeAngle = (v) => ((v % 360) + 360) % 360;
    return {
      heading: value.heading === undefined ? 0 : normalizeAngle(toNumber(value.heading, "rotation.heading")),
      tilt: value.tilt === undefined ? 0 : toNumber(value.tilt, "rotation.tilt"),
      roll: value.roll === undefined ? 0 : toNumber(value.roll, "rotation.roll"),
    };
  }

  return {
    heading: 0,
    tilt: 0,
    roll: 0,
  };
}

function normalizeProperties(properties, featureId, geometryType) {
  const entityType = inferEntityType(geometryType, properties);
  const id = String(properties.id ?? featureId ?? "").trim();
  const name = String(properties.name ?? id).trim();

  if (!id) {
    throw new HttpError(400, "Entity requires a non-empty id.");
  }

  if (!name) {
    throw new HttpError(400, "Entity requires a non-empty name.");
  }

  const normalizedProperties = {
    ...properties,
    id,
    name,
    entityType,
    style: optionalRecord(properties.style),
    metadata: optionalRecord(properties.metadata),
  };

  if (entityType === "model3d") {
    const fallbackSize = 20;
    normalizedProperties.modelUrl = String(properties.modelUrl ?? "");
    normalizedProperties.scale = normalizeScale(properties.scale, fallbackSize);
    normalizedProperties.rotation = normalizeRotation(properties.rotation);
  }

  return normalizedProperties;
}

function assertIndependentEntityFeature(value) {
  if (!isRecord(value)) {
    throw new HttpError(400, "Missing entity payload.");
  }

  if (value.type !== "Feature") {
    throw new HttpError(400, "Entity payload must be a GeoJSON Feature.");
  }

  const geometry = normalizeGeometry(value.geometry);
  const properties = normalizeProperties(
    optionalRecord(value.properties),
    value.id,
    geometry.type,
  );

  return {
    type: "Feature",
    geometry,
    properties,
  };
}

function assertMapPointEntity(value) {
  if (!isRecord(value)) {
    throw new HttpError(400, "Missing entity payload.");
  }

  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new HttpError(400, "Entity requires a non-empty id.");
  }

  if (typeof value.name !== "string" || !value.name.trim()) {
    throw new HttpError(400, "Entity requires a non-empty name.");
  }

  return {
    ...value,
    id: value.id.trim(),
    name: value.name.trim(),
    longitude: toNumber(value.longitude, "longitude"),
    latitude: toNumber(value.latitude, "latitude"),
    z: value.z === undefined ? 0 : toNumber(value.z, "z"),
    source: {
      kind: "independent",
    },
  };
}

function featureFromMapPointEntity(value) {
  const entity = assertMapPointEntity(value);
  const model3D = optionalRecord(entity.model3D);
  const pin = optionalRecord(entity.pin);
  const isModel = entity.type !== "point" && model3D.enabled !== false;
  const fallbackSize =
    model3D.scale ?? model3D.height ?? model3D.width ?? model3D.depth ?? 20;

  return assertIndependentEntityFeature({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [entity.longitude, entity.latitude, entity.z ?? 0],
    },
    properties: {
      id: entity.id,
      name: entity.name,
      entityType: isModel ? "model3d" : "point",
      modelId: entity.modelId,
      modelUrl: model3D.url,
      scale: fallbackSize,
      rotation: {
        heading: model3D.heading ?? 0,
        tilt: model3D.tilt ?? 0,
        roll: model3D.roll ?? 0,
      },
      split: entity.split,
      style: isModel
        ? {
            pinColor: pin.color ?? "#ef4444",
            pinSize: pin.size ?? 36,
          }
        : {
            color: pin.color ?? "#ef4444",
            size: pin.size ?? 32,
            iconUrl: pin.iconUrl ?? "/icons/map-pin.svg",
          },
      metadata: optionalRecord(entity.metadata),
    },
  });
}

function assertIndependentEntityPayload(value) {
  const payload = isRecord(value?.feature)
    ? value.feature
    : isRecord(value?.entity)
      ? value.entity
      : value;

  if (isRecord(payload) && payload.type === "Feature") {
    return assertIndependentEntityFeature(payload);
  }

  return featureFromMapPointEntity(payload);
}

module.exports = {
  assertIndependentEntityFeature,
  assertIndependentEntityPayload,
  assertMapPointEntity,
  featureFromMapPointEntity,
};
