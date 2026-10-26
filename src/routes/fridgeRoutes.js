const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  addIngredient,
  getFridgeIngredients,
  updateFridgeIngredient,
  deleteFridgeIngredient,
} = require("../controllers/fridgeController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Fridge
 *   description: API liên quan đến tủ lạnh của người dùng
 */

/**
 * @swagger
 * /api/fridge:
 *   post:
 *     summary: Thêm nguyên liệu vào tủ lạnh của người dùng
 *     tags: [Fridge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ingredientId:
 *                 type: integer
 *                 description: ID của nguyên liệu
 *               quantity:
 *                 type: number
 *                 description: Số lượng nguyên liệu
 *               unit:
 *                 type: string
 *                 description: Đơn vị đo lường của nguyên liệu
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày hết hạn của nguyên liệu (nếu có)
 *             example:
 *               ingredientId: 1
 *               quantity: 2
 *               unit: "kg"
 *               expiresAt: "2024-12-31T23:59:59Z"
 *     responses:
 *       201:
 *         description: Thêm nguyên liệu vào tủ lạnh thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.post("/", authMiddleware, addIngredient);

/**
 * @swagger
 * /api/fridge:
 *   get:
 *     summary: Lấy danh sách nguyên liệu trong tủ lạnh của người dùng
 *     tags: [Fridge]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách nguyên liệu trong tủ lạnh
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.get("/", authMiddleware, getFridgeIngredients);

/**
 * @swagger
 * /api/fridge/{id}:
 *   put:
 *     summary: Cập nhật thông tin nguyên liệu trong tủ lạnh của người dùng
 *     tags: [Fridge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của nguyên liệu trong tủ lạnh
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               quantity:
 *                 type: number
 *                 description: Số lượng nguyên liệu
 *               unit:
 *                 type: string
 *                 description: Đơn vị đo lường của nguyên liệu
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Ngày hết hạn của nguyên liệu (nếu có)
 *             example:
 *               quantity: 3
 *               unit: "kg"
 *               expiresAt: "2025-01-15T23:59:59Z"
 *     responses:
 *       200:
 *         description: Cập nhật thông tin nguyên liệu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 *       404:
 *         description: Không tìm thấy nguyên liệu trong tủ lạnh
 */
router.put("/:id", authMiddleware, updateFridgeIngredient);

/**
 * @swagger
 * /api/fridge/{id}:
 *   delete:
 *     summary: Xóa nguyên liệu khỏi tủ lạnh của người dùng
 *     tags: [Fridge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID của nguyên liệu trong tủ lạnh
 *     responses:
 *       200:
 *         description: Xóa nguyên liệu thành công
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 *       404:
 *         description: Không tìm thấy nguyên liệu trong tủ lạnh
 */
router.delete("/:id", authMiddleware, deleteFridgeIngredient);

module.exports = router;
