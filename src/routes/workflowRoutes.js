const router = require("express").Router();
const auth = require("../middlewares/authMiddleware");
const catalog = require("../controllers/catalogController");
const shopping = require("../controllers/shoppingController");
const cooking = require("../controllers/cookingController");
const notifications = require("../controllers/notificationController");

router.get("/fridge/summary", auth, catalog.summary);
router.get("/ingredient-categories", auth, catalog.categories);
router.get("/units", auth, catalog.units);
router.get("/shopping-list", auth, shopping.list);
router.post("/shopping-list/items", auth, shopping.create);
router.patch("/shopping-list/items/:id", auth, shopping.update);
router.delete("/shopping-list/items/:id", auth, shopping.remove);
router.post("/shopping-list/from-recipe/:recipeId", auth, shopping.fromRecipe);
router.post("/shopping-list/items/:id/move-to-fridge", auth, shopping.move);
router.get("/cooking-sessions", auth, cooking.list);
router.post("/cooking-sessions", auth, cooking.create);
router.get("/cooking-sessions/:id", auth, cooking.get);
router.post("/devices", auth, notifications.registerDevice);
router.delete("/devices/:id", auth, notifications.removeDevice);
router.get("/settings/notifications", auth, notifications.getSettings);
router.put("/settings/notifications", auth, notifications.updateSettings);

module.exports = router;
