const router = require("express").Router();
const catalogController = require("../../controllers/admin/catalogController");
const users = require("../../controllers/admin/userController");
const statistics = require("../../controllers/admin/statisticsController");

// Auth và role ADMIN được áp dụng một lần tại admin-server.js trước khi mount.
for (const resource of ["recipes", "ingredients", "regions"]) {
  const controller = catalogController(resource);
  router.get(`/${resource}`, controller.list);
  router.get(`/${resource}/:id`, controller.get);
  router.post(`/${resource}`, controller.create);
  router.put(`/${resource}/:id`, controller.update);
  router.delete(`/${resource}/:id`, controller.delete);
}
router.get("/users", users.list);
router.get("/users/:id", users.get);
router.patch("/users/:id/status", users.updateStatus);
router.get("/statistics/overview", statistics.overview);
router.get("/statistics/recipes", statistics.recipes);
router.get("/statistics/ai", statistics.ai);

module.exports = router;
