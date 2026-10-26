const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { getIngredients } = require("../controllers/ingredientController");

const router = express.Router();

//swagger tags
/**
 * @swagger
 * tags:
 *   name: Ingredients
 *   description: API liên quan đến nguyên liệu
 */

/**
 * @swagger
 * /api/ingredients:
 *   get:
 *     summary: Lấy danh sách nguyên liệu
 *     tags: [Ingredients]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nguyên liệu
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.get("/", authMiddleware, getIngredients);

module.exports = router;
