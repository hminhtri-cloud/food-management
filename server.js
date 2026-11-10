const express = require("express");
require("./src/config/database");
const authRoutes = require("./src/routes/authRoutes");
const settingsRoutes = require("./src/routes/settingsRoutes");
const preferencesRoutes = require("./src/routes/preferencesRoutes");
const ingredientRoutes = require("./src/routes/ingredientRoutes");
const fridgeRoutes = require("./src/routes/fridgeRoutes");
const recipeRoutes = require("./src/routes/recipeRoutes");
const regionRoutes = require("./src/routes/regionRoutes");
const favoriteRoutes = require("./src/routes/favoriteRoutes");
const healthRoutes = require("./src/routes/healthRoutes");

//swagger
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

const app = express();
const PORT = process.env.USER_PORT || process.env.PORT || 3000;
app.locals.portal = "user";
app.locals.requiredRole = "USER";

app.use(express.json());

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.path} ` +
        `${res.statusCode} ${Date.now() - startedAt}ms`,
    );
  });

  next();
});
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/fridge", fridgeRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/regions", regionRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api", (req, res) =>
  res.status(404).json({ message: "API không tồn tại trên cổng user" }),
);
app.use("/", swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`User API và Swagger: http://localhost:${PORT}`);
  });
}

module.exports = app;
