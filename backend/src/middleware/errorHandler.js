const { isHttpError } = require("../utils/httpError");

function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} was not found.`,
  });
}

function errorHandler(error, _req, res, _next) {
  const status = isHttpError(error) ? error.status : 500;
  const payload = {
    error: error instanceof Error ? error.message : String(error),
  };

  if (isHttpError(error) && error.details) {
    payload.details = error.details;
  }

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json(payload);
}

module.exports = {
  errorHandler,
  notFoundHandler,
};

