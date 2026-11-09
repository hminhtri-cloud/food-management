const pool = require("../config/database");

const normalize = (value) => String(value).trim().toLocaleLowerCase("vi");

const positiveId = (value) => {
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
};

const parseFilters = (query) => {
  const page = query.page === undefined ? 1 : positiveId(query.page);
  const limit = query.limit === undefined ? 20 : positiveId(query.limit);
  if (!page || !limit || limit > 100) {
    throw Object.assign(new Error("page phải là số dương; limit từ 1 đến 100"), { status: 400 });
  }
  if (query.search !== undefined && typeof query.search !== "string") {
    throw Object.assign(new Error("search phải là chuỗi"), { status: 400 });
  }
  let regionIds;
  if (query.regionIds !== undefined) {
    if (typeof query.regionIds !== "string") {
      throw Object.assign(new Error("regionIds phải là all hoặc các ID cách nhau bằng dấu phẩy"), { status: 400 });
    }
    regionIds = query.regionIds === "all" ? [] : query.regionIds.split(",").map(positiveId);
    if (regionIds.some((id) => id === null)) {
      throw Object.assign(new Error("regionIds không hợp lệ"), { status: 400 });
    }
  }
  return { page, limit, search: query.search || "", regionIds };
};

const paginate = (items, { page, limit }) => ({
  recipes: items.slice((page - 1) * limit, page * limit),
  pagination: { page, limit, total: items.length, totalPages: Math.ceil(items.length / limit) },
});

const getContext = async (userId) => {
  const [stock, preferences] = await Promise.all([
    pool.query(
      `SELECT ingredient_id, quantity::float8 AS quantity, unit,
              expires_at IS NOT NULL AND expires_at <= CURRENT_DATE + 3 AS expiring_soon
       FROM user_ingredients
       WHERE user_id = $1 AND quantity > 0
         AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)`, [userId]),
    pool.query("SELECT * FROM user_preferences WHERE user_id = $1", [userId]),
  ]);
  return { stock: stock.rows, preferences: preferences.rows[0] || {} };
};

// So khớp theo loại nguyên liệu; không tự quy đổi giữa các đơn vị.
const matchRecipe = (recipe, ingredients, stock, preferences = {}) => {
  const avoided = [...(preferences.excluded_ingredients || []), ...(preferences.allergies || [])]
    .filter((value) => typeof value === "string").map(normalize);
  const matched = ingredients.map((ingredient) => {
    const batches = stock.filter((item) => item.ingredient_id === ingredient.id);
    const comparable = batches.filter((item) => normalize(item.unit) === normalize(ingredient.unit));
    const availableQuantity = comparable.reduce((total, item) => total + Number(item.quantity), 0);
    return {
      ...ingredient,
      available: batches.length > 0,
      availableQuantity,
      quantitySufficient: batches.length === 0 ? false
        : comparable.length === 0 ? null : availableQuantity >= ingredient.quantity,
      expiringSoon: batches.some((item) => item.expiring_soon),
      avoided: avoided.includes(normalize(ingredient.name)) ||
        (ingredient.categoryName !== null && avoided.includes(normalize(ingredient.categoryName))),
    };
  });
  const missingIngredients = matched.filter((item) => !item.available);
  const expiringIngredientCount = matched.filter((item) => item.expiringSoon).length;
  return {
    ...recipe,
    matchPercentage: matched.length ? Math.round((matched.length - missingIngredients.length) / matched.length * 100) : 0,
    missingIngredientCount: missingIngredients.length,
    missingIngredients,
    expiringIngredientCount,
    shouldCookSoon: expiringIngredientCount > 0,
    matchesPreferences: !matched.some((item) => item.avoided),
    ingredients: matched,
  };
};

const loadRecipes = async (userId, filters = {}) => {
  const result = await pool.query(
    `SELECT r.id, r.name, r.image_url AS "imageUrl", r.source_url AS "sourceUrl",
            r.region_id AS "regionId", rg.name AS "regionName",
            EXISTS(SELECT 1 FROM favorites f WHERE f.recipe_id = r.id AND f.user_id = $1) AS "isFavorite"
     FROM recipes r JOIN regions rg ON rg.id = r.region_id
     WHERE ($2::int IS NULL OR r.id = $2)
       AND ($3::text = '' OR r.name ILIKE '%' || $3 || '%')
       AND (cardinality($4::int[]) = 0 OR r.region_id = ANY($4::int[]))
       AND ($5::boolean = FALSE OR EXISTS(
         SELECT 1 FROM favorites f WHERE f.recipe_id = r.id AND f.user_id = $1))
     ORDER BY r.name, r.id`,
    [userId, filters.id || null, filters.search || "", filters.regionIds || [], !!filters.favoritesOnly]);
  if (!result.rows.length) return [];
  const [ingredients, context] = await Promise.all([
    pool.query(
      `SELECT ri.recipe_id, i.id, i.name, c.name AS "categoryName",
              ri.quantity::float8 AS quantity, ri.unit
       FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id
       LEFT JOIN ingredient_categories c ON c.id = i.category_id
       WHERE ri.recipe_id = ANY($1::int[]) ORDER BY i.name`, [result.rows.map((r) => r.id)]),
    getContext(userId),
  ]);
  return result.rows.map((recipe) => matchRecipe(recipe,
    ingredients.rows.filter((item) => item.recipe_id === recipe.id).map(({ recipe_id, ...item }) => item),
    context.stock, context.preferences));
};

module.exports = { positiveId, parseFilters, paginate, getContext, matchRecipe, loadRecipes };
