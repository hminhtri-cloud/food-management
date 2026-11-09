require("./src/config/database");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/adminSwagger");
const authRoutes = require("./src/routes/admin/authRoutes");
const healthRoutes = require("./src/routes/healthRoutes");
const authMiddleware = require("./src/middlewares/authMiddleware");
const roleMiddleware = require("./src/middlewares/roleMiddleware");

const app = express();
app.locals.portal = "admin";
app.locals.requiredRole = "ADMIN";
app.use(express.json());
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);

// Các module quản trị sau này mount dưới router này để luôn kiểm tra quyền.
const adminRouter = express.Router();
adminRouter.use(authMiddleware, roleMiddleware("ADMIN"));
app.use("/api/admin", adminRouter);

app.use("/api", (req, res) => res.status(404).json({ message: "API không tồn tại trên cổng admin" }));
app.use("/", swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));

if (require.main === module) {
  const port = process.env.ADMIN_PORT || 3001;
  app.listen(port, () => console.log(`Admin API và Swagger: http://localhost:${port}`));
}

module.exports = app;
