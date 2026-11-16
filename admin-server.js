require("./src/config/database");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/adminSwagger");
const authRoutes = require("./src/routes/admin/authRoutes");
const healthRoutes = require("./src/routes/healthRoutes");
const authMiddleware = require("./src/middlewares/authMiddleware");
const roleMiddleware = require("./src/middlewares/roleMiddleware");
const managementRoutes = require("./src/routes/admin/managementRoutes");

const app = express();
app.locals.portal = "admin";
app.locals.requiredRole = "ADMIN";
app.use(express.json());
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);

// Tất cả API quản trị đều phải đi qua kiểm tra tài khoản và quyền hiện tại từ DB.
const adminRouter = express.Router();
adminRouter.use(authMiddleware, roleMiddleware("ADMIN"));
adminRouter.use(managementRoutes);
app.use("/api/admin", adminRouter);

app.use("/api", (req, res) => res.status(404).json({ message: "API không tồn tại trên cổng admin" }));
app.use("/", swaggerUi.serveFiles(swaggerSpec), swaggerUi.setup(swaggerSpec));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === "entity.parse.failed") return res.status(400).json({ message: "Body JSON không hợp lệ" });
  if (error.type === "entity.too.large") return res.status(413).json({ message: "Body vượt giới hạn kích thước" });
  console.error(error);
  return res.status(500).json({ message: "Lỗi máy chủ" });
});

if (require.main === module) {
  const port = process.env.ADMIN_PORT || 3001;
  app.listen(port, () => console.log(`Admin API và Swagger: http://localhost:${port}`));
}

module.exports = app;
