const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { getFavorites, addFavorite, deleteFavorite } = require("../controllers/favoriteController");
const router = express.Router();
router.use(authMiddleware);

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: Danh sách công thức yêu thích của tôi
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeSearch'
 *       - $ref: '#/components/parameters/RecipeRegions'
 *       - $ref: '#/components/parameters/RecipePage'
 *       - $ref: '#/components/parameters/RecipeLimit'
 *     responses:
 *       200:
 *         description: recipes đã lưu và pagination
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 * /api/favorites/{recipeId}:
 *   post:
 *     summary: Lưu công thức vào yêu thích (gọi lại không tạo trùng)
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: recipeId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       201:
 *         description: Đã thêm yêu thích
 *       200:
 *         description: Đã có trong yêu thích
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy công thức
 *       401:
 *         description: Chưa đăng nhập
 *   delete:
 *     summary: Bỏ yêu thích công thức của tôi
 *     tags: [Favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: recipeId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: Đã bỏ yêu thích (kể cả khi chưa lưu)
 *       400:
 *         description: ID không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 */
router.get("/", getFavorites);
router.post("/:recipeId", addFavorite);
router.delete("/:recipeId", deleteFavorite);
module.exports = router;
