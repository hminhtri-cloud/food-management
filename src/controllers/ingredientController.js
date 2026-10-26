const pool = require("../config/database");

const getIngredients = async (req, res) => {
  try {
    const { search, categoryId } = req.query;

    const conditions = [];
    const values = [];

    if (search) {
      values.push(`%${search}%`);
      conditions.push(`i.name ILIKE $${values.length}`);
    }

    if (categoryId) {
      values.push(categoryId);
      conditions.push(`i.category_id = $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
         i.id,
         i.name,
         i.default_unit,
         c.id AS category_id,
         c.name AS category_name
       FROM ingredients i
       LEFT JOIN ingredient_categories c ON c.id = i.category_id
       ${whereClause}
       ORDER BY i.name ASC`,
      values,
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

module.exports = {
  getIngredients,
};
