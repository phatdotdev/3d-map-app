const { HttpError } = require("./httpError");

function parseBbox(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "bbox must use xmin,ymin,xmax,ymax format.");
  }

  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new HttpError(400, "bbox must include four numeric values.");
  }

  const [xmin, ymin, xmax, ymax] = parts;

  if (xmin > xmax || ymin > ymax) {
    throw new HttpError(400, "bbox min values must be smaller than max values.");
  }

  return {
    xmin,
    ymin,
    xmax,
    ymax,
  };
}

function isPointInBbox(coordinates, bbox) {
  if (!bbox) return true;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return false;

  const [longitude, latitude] = coordinates;

  return (
    typeof longitude === "number" &&
    typeof latitude === "number" &&
    longitude >= bbox.xmin &&
    longitude <= bbox.xmax &&
    latitude >= bbox.ymin &&
    latitude <= bbox.ymax
  );
}

function collectPositions(value, result = []) {
  if (!Array.isArray(value)) {
    return result;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    result.push(value);
    return result;
  }

  value.forEach((item) => collectPositions(item, result));
  return result;
}

function getGeometryBbox(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const positions = collectPositions(geometry.coordinates);

  if (positions.length === 0) {
    return null;
  }

  return positions.reduce(
    (bounds, position) => {
      const [longitude, latitude] = position;

      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return bounds;
      }

      return {
        xmin: Math.min(bounds.xmin, longitude),
        ymin: Math.min(bounds.ymin, latitude),
        xmax: Math.max(bounds.xmax, longitude),
        ymax: Math.max(bounds.ymax, latitude),
      };
    },
    {
      xmin: Infinity,
      ymin: Infinity,
      xmax: -Infinity,
      ymax: -Infinity,
    },
  );
}

function bboxIntersects(first, second) {
  if (!first || !second) {
    return false;
  }

  return (
    first.xmin <= second.xmax &&
    first.xmax >= second.xmin &&
    first.ymin <= second.ymax &&
    first.ymax >= second.ymin
  );
}

function isGeometryInBbox(geometry, bbox) {
  if (!bbox) return true;

  if (!geometry || typeof geometry.type !== "string") {
    return false;
  }

  if (geometry.type === "Point") {
    return isPointInBbox(geometry.coordinates, bbox);
  }

  if (geometry.type === "LineString") {
    return collectPositions(geometry.coordinates).some((position) =>
      isPointInBbox(position, bbox),
    );
  }

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    return bboxIntersects(getGeometryBbox(geometry), bbox);
  }

  return false;
}

module.exports = {
  bboxIntersects,
  getGeometryBbox,
  isGeometryInBbox,
  isPointInBbox,
  parseBbox,
};
