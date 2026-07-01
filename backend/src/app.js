const express = require("express");

const { modelsDir, rawDataDir } = require("./config/paths");
const corsMiddleware = require("./middleware/corsMiddleware");
const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");
const independentEntityRoutes = require("./routes/independentEntityRoutes");
const modelRoutes = require("./routes/modelRoutes");
const exportWebAssetsRoutes = require("./routes/exportWebAssetsRoutes");
const spatialLayerRoutes = require("./routes/spatialLayerRoutes");

const app = express();

app.use(corsMiddleware);
app.use(express.json({ limit: "120mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "map-backend",
  });
});

app.use("/raw", express.static(rawDataDir));
app.use("/data/raw", express.static(rawDataDir));
app.use("/models", express.static(modelsDir));
app.use("/api/models", modelRoutes);
app.use("/api/export-web-assets", exportWebAssetsRoutes);
app.use("/api/independent-entities", independentEntityRoutes);
app.use("/api/spatial-layers", spatialLayerRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
