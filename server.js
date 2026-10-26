const express = require("express");
const pool = require("./src/config/database");
const authRoutes = require("./src/routes/authRoutes");
const settingsRoutes = require("./src/routes/settingsRoutes");
const preferencesRoutes = require("./src/routes/preferencesRoutes");
const ingredientRoutes = require("./src/routes/ingredientRoutes");
const fridgeRoutes = require("./src/routes/fridgeRoutes");

//swagger
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

const app = express();
const PORT = 3000;

app.use(express.json());

//swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");

    res.json({
      message: "Backend and database are running",
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/preferences", preferencesRoutes);
app.use("/api/ingredients", ingredientRoutes);
app.use("/api/fridge", fridgeRoutes);
