const pool = require("../config/database");

const getPreferences = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, default_region, excluded_ingredients, allergies
       FROM user_preferences
       WHERE user_id = $1`,
      [req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.json({
        defaultRegion: null,
        excludedIngredients: [],
        allergies: [],
      });
    }

    const preferences = result.rows[0];

    return res.json({
      defaultRegion: preferences.default_region,
      excludedIngredients: preferences.excluded_ingredients,
      allergies: preferences.allergies,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const updatePreferences = async (req, res) => {
  try {
    const {
      defaultRegion,
      excludedIngredients = [],
      allergies = [],
    } = req.body;

    if (!Array.isArray(excludedIngredients) || !Array.isArray(allergies)) {
      return res.status(400).json({
        message: "Danh sách nguyên liệu phải là array",
      });
    }

    const result = await pool.query(
      `INSERT INTO user_preferences
        (user_id, default_region, excluded_ingredients, allergies)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET
         default_region = EXCLUDED.default_region,
         excluded_ingredients = EXCLUDED.excluded_ingredients,
         allergies = EXCLUDED.allergies,
         updated_at = NOW()
       RETURNING user_id, default_region, excluded_ingredients, allergies`,
      [
        req.user.userId,
        defaultRegion || null,
        JSON.stringify(excludedIngredients),
        JSON.stringify(allergies),
      ],
    );

    const preferences = result.rows[0];

    return res.json({
      message: "Lưu tùy chọn thành công",
      preferences: {
        defaultRegion: preferences.default_region,
        excludedIngredients: preferences.excluded_ingredients,
        allergies: preferences.allergies,
      },
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = {
  getPreferences,
  updatePreferences,
};
