const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getPreferences,
  updatePreferences,
} = require("../controllers/preferencesController");

const router = express.Router();

//swagger tags
/**
 * @swagger
 * tags:
 *   name: Preferences
 *   description: API liên quan đến sở thích người dùng
 */

/**
 * @swagger
 * /api/preferences:
 *   get:
 *     summary: Lấy thông tin sở thích người dùng
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin sở thích người dùng
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */

/**
 * @swagger
 * /api/preferences:
 *   put:
 *     summary: Cập nhật thông tin sở thích người dùng
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dietaryRestrictions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách các hạn chế ăn uống của người dùng
 *               favoriteIngredients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách các nguyên liệu yêu thích của người dùng
 *             example:
 *               dietaryRestrictions: ["Vegetarian", "Gluten-Free"]
 *               favoriteIngredients: ["Tomato", "Basil", "Garlic"]
 *     responses:
 *       200:
 *         description: Cập nhật thông tin sở thích thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.get("/", authMiddleware, getPreferences);

/**
 * @swagger
 * /api/preferences:
 *   put:
 *     summary: Cập nhật thông tin sở thích người dùng
 *     tags: [Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               dietaryRestrictions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách các hạn chế ăn uống của người dùng
 *               favoriteIngredients:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Danh sách các nguyên liệu yêu thích của người dùng
 *             example:
 *               dietaryRestrictions: ["Vegetarian", "Gluten-Free"]
 *               favoriteIngredients: ["Tomato", "Basil", "Garlic"]
 *     responses:
 *       200:
 *         description: Cập nhật thông tin sở thích thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.put("/", authMiddleware, updatePreferences);

module.exports = router;
