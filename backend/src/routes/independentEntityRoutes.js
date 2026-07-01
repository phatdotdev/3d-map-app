const express = require("express");

const independentEntityController = require("../controllers/independentEntityController");

const router = express.Router();

router.get("/", independentEntityController.getIndependentEntities);
router.get("/:entityId", independentEntityController.getIndependentEntity);
router.post("/", independentEntityController.createIndependentEntity);
router.put("/:entityId", independentEntityController.updateIndependentEntity);
router.delete("/:entityId", independentEntityController.deleteIndependentEntity);

module.exports = router;
