const pool = require("../config/database");

const addIngredient = async (req, res) => {
  try {
    const { ingredientId, quantity, unit, expiresAt } = req.body;

    if (!ingredientId || !unit) {
      return res.status(400).json({
        message: "ingredientId và unit là bắt buộc",
      });
    }

    const ingredient = await pool.query(
      "SELECT id FROM ingredients WHERE id = $1",
      [ingredientId],
    );

    if (ingredient.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy nguyên liệu",
      });
    }

    const result = await pool.query(
      `INSERT INTO user_ingredients
    (user_id, ingredient_id, quantity, unit, expires_at)
   VALUES ($1, $2, $3, $4, $5)
   RETURNING id, user_id, ingredient_id, quantity, unit,
             expires_at::text AS expires_at`,
      [req.user.userId, ingredientId, quantity || 0, unit, expiresAt || null],
    );

    return res.status(201).json({
      message: "Thêm nguyên liệu vào tủ lạnh thành công",
      ingredient: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const getFridgeIngredients = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         ui.id,
         ui.quantity,
         ui.unit,
         ui.expires_at::text AS expires_at,
         i.id AS ingredient_id,
         i.name,
         c.name AS category_name,
         CASE
           WHEN ui.expires_at IS NULL THEN 'NO_EXPIRY'
           WHEN ui.expires_at < CURRENT_DATE THEN 'EXPIRED'
           WHEN ui.expires_at <= CURRENT_DATE + 3 THEN 'EXPIRING_SOON'
           ELSE 'FRESH'
         END AS expiry_status
       FROM user_ingredients ui
       JOIN ingredients i ON i.id = ui.ingredient_id
       LEFT JOIN ingredient_categories c ON c.id = i.category_id
       WHERE ui.user_id = $1
       ORDER BY ui.expires_at ASC NULLS LAST, i.name ASC`,
      [req.user.userId],
    );

    return res.json({
      ingredients: result.rows,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const updateFridgeIngredient = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, unit, expiresAt } = req.body;

    if (
      quantity === undefined &&
      unit === undefined &&
      expiresAt === undefined
    ) {
      return res.status(400).json({
        message: "Cần có ít nhất một trường để cập nhật",
      });
    }

    const result = await pool.query(
      `UPDATE user_ingredients
       SET quantity = COALESCE($1, quantity),
           unit = COALESCE($2, unit),
           expires_at = COALESCE($3, expires_at),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING id, user_id, ingredient_id, quantity, unit,
                 expires_at::text AS expires_at`,
      [quantity ?? null, unit ?? null, expiresAt ?? null, id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy nguyên liệu trong tủ lạnh",
      });
    }

    return res.json({
      message: "Cập nhật nguyên liệu thành công",
      ingredient: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const deleteFridgeIngredient = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM user_ingredients
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy nguyên liệu trong tủ lạnh",
      });
    }

    return res.json({
      message: "Xóa nguyên liệu thành công",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = {
  addIngredient,
  getFridgeIngredients,
  updateFridgeIngredient,
  deleteFridgeIngredient,
};
