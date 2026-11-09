const pool = require("../config/database");
const { positiveId, parseFilters, paginate, getContext, loadRecipes } = require("../services/recipeService");

const handleError = (res, error) => {
  console.error(error.message);
  return res.status(error.status || 500).json({ message: error.status ? error.message : "Lỗi máy chủ" });
};

const getRecipes = async (req, res) => {
  try {
    const filters = parseFilters(req.query);
    return res.json(paginate(await loadRecipes(req.user.userId, filters), filters));
  } catch (error) { return handleError(res, error); }
};

const getRecommendations = async (req, res) => {
  try {
    const filters = parseFilters(req.query);
    // Không truyền regionIds thì áp dụng vùng mặc định; all bỏ lọc.
    if (filters.regionIds === undefined) {
      const { preferences } = await getContext(req.user.userId);
      if (preferences.default_region) {
        const region = await pool.query("SELECT id FROM regions WHERE name = $1", [preferences.default_region]);
        if (region.rows.length) filters.regionIds = [region.rows[0].id];
      }
    }
    const recipes = (await loadRecipes(req.user.userId, filters))
      .filter((recipe) => recipe.ingredients.length > 0 && recipe.matchesPreferences)
      .sort((a, b) => Number(b.shouldCookSoon) - Number(a.shouldCookSoon)
        || b.matchPercentage - a.matchPercentage
        || b.expiringIngredientCount - a.expiringIngredientCount
        || a.id - b.id);
    return res.json(paginate(recipes, filters));
  } catch (error) { return handleError(res, error); }
};

const getRecipe = async (req, res) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ message: "ID công thức không hợp lệ" });
    const [recipe] = await loadRecipes(req.user.userId, { id });
    if (!recipe) return res.status(404).json({ message: "Không tìm thấy công thức" });
    return res.json({ recipe });
  } catch (error) { return handleError(res, error); }
};

module.exports = { getRecipes, getRecommendations, getRecipe };
