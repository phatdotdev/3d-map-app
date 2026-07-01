const express = require("express");

const modelController = require("../controllers/modelController");

const router = express.Router();

router.get("/", modelController.getModels);
router.post("/upload", modelController.uploadModel);
router.post("/:modelId/split", modelController.splitModel);
router.get("/:modelId/parts", modelController.getModelParts);
router.delete("/:modelId", modelController.deleteModel);

module.exports = router;

