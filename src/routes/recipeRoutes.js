const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { getRecipes, getRecommendations, getRecipe } = require("../controllers/recipeController");
const router = express.Router();
router.use(authMiddleware);

/**
 * @swagger
 * components:
 *   parameters:
 *     RecipeSearch:
 *       in: query
 *       name: search
 *       schema:
 *         type: string
 *       description: Tìm tên món (không phân biệt hoa thường, có phân biệt dấu)
 *     RecipeRegions:
 *       in: query
 *       name: regionIds
 *       schema:
 *         type: string
 *       description: ID vùng cách nhau bằng dấu phẩy, ví dụ 1,3. Dùng all để bỏ lọc.
 *     RecipePage:
 *       in: query
 *       name: page
 *       schema:
 *         type: integer
 *         minimum: 1
 *         default: 1
 *     RecipeLimit:
 *       in: query
 *       name: limit
 *       schema:
 *         type: integer
 *         minimum: 1
 *         maximum: 100
 *         default: 20
 * /api/recipes:
 *   get:
 *     summary: Danh sách công thức, tìm kiếm và lọc nhiều vùng miền
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeSearch'
 *       - $ref: '#/components/parameters/RecipeRegions'
 *       - $ref: '#/components/parameters/RecipePage'
 *       - $ref: '#/components/parameters/RecipeLimit'
 *     responses:
 *       200:
 *         description: Danh sách recipes và pagination, kèm so khớp với tủ lạnh
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 * /api/recipes/recommendations:
 *   get:
 *     summary: Gợi ý món theo tủ lạnh và khẩu vị
 *     description: Loại món kiêng hoặc dị ứng; ưu tiên đồ sắp hết hạn rồi phần trăm khớp. Mặc định dùng vùng đã lưu; regionIds=all bỏ lọc. Đồ hết hạn hoặc số lượng 0 không được tính.
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/RecipeSearch'
 *       - $ref: '#/components/parameters/RecipeRegions'
 *       - $ref: '#/components/parameters/RecipePage'
 *       - $ref: '#/components/parameters/RecipeLimit'
 *     responses:
 *       200:
 *         description: recipes kèm matchPercentage, missingIngredients, shouldCookSoon và pagination
 *       400:
 *         description: Tham số không hợp lệ
 *       401:
 *         description: Chưa đăng nhập
 * /api/recipes/{id}:
 *   get:
 *     summary: Chi tiết công thức và nguyên liệu đã có hoặc còn thiếu
 *     tags: [Recipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *     responses:
 *       200:
 *         description: recipe kèm imageUrl, sourceUrl, ingredients và isFavorite
 *       400:
 *         description: ID không hợp lệ
 *       404:
 *         description: Không tìm thấy công thức
 *       401:
 *         description: Chưa đăng nhập
 */
router.get("/", getRecipes);
router.get("/recommendations", getRecommendations);
router.get("/:id", getRecipe);
module.exports = router;
