const express = require("express");

const spatialLayerController = require("../controllers/spatialLayerController");

const router = express.Router();

router.get("/", spatialLayerController.getSpatialLayers);
router.post("/", spatialLayerController.createSpatialLayer);
router.put(
  "/:layerId/features/:featureId/geometry",
  spatialLayerController.updateSpatialLayerFeatureGeometry,
);
router.put("/:layerId", spatialLayerController.updateSpatialLayer);
router.delete("/:layerId", spatialLayerController.deleteSpatialLayer);

module.exports = router;
