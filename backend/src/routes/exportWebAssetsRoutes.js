const express = require("express");

const exportWebAssetsController = require("../controllers/exportWebAssetsController");

const router = express.Router();

router.post("/", exportWebAssetsController.exportWebAssets);

module.exports = router;

