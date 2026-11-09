const pool = require("../config/database");
const { positiveId, parseFilters, paginate, loadRecipes } = require("../services/recipeService");

const getFavorites = async (req, res) => {
  try {
    const filters = parseFilters(req.query);
    const recipes = await loadRecipes(req.user.userId, { ...filters, favoritesOnly: true });
    return res.json(paginate(recipes, filters));
  } catch (error) {
    console.error(error.message);
    return res.status(error.status || 500).json({ message: error.status ? error.message : "Lỗi máy chủ" });
  }
};

const addFavorite = async (req, res) => {
  try {
    const recipeId = positiveId(req.params.recipeId);
    if (!recipeId) return res.status(400).json({ message: "ID công thức không hợp lệ" });
    const recipe = await pool.query("SELECT id FROM recipes WHERE id = $1", [recipeId]);
    if (!recipe.rows.length) return res.status(404).json({ message: "Không tìm thấy công thức" });
    const result = await pool.query(
      `INSERT INTO favorites (user_id, recipe_id) VALUES ($1, $2)
       ON CONFLICT (user_id, recipe_id) DO NOTHING RETURNING recipe_id`,
      [req.user.userId, recipeId]);
    return res.status(result.rowCount ? 201 : 200).json({ message: "Đã lưu món yêu thích", recipeId });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

const deleteFavorite = async (req, res) => {
  try {
    const recipeId = positiveId(req.params.recipeId);
    if (!recipeId) return res.status(400).json({ message: "ID công thức không hợp lệ" });
    await pool.query("DELETE FROM favorites WHERE user_id = $1 AND recipe_id = $2", [req.user.userId, recipeId]);
    return res.json({ message: "Đã bỏ yêu thích", recipeId });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

module.exports = { getFavorites, addFavorite, deleteFavorite };
