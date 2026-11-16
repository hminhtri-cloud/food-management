const { pool, endpoint, getUnits } = require("../services/workflowService");

const categories = endpoint(async (req, res) => {
  res.json({ categories: (await pool.query("SELECT id, name FROM ingredient_categories ORDER BY name, id")).rows });
});
const units = endpoint(async (req, res) => res.json({ units: await getUnits() }));
const summary = endpoint(async (req, res) => {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS "totalItems",
     COUNT(*) FILTER (WHERE expires_at > CURRENT_DATE + 3)::int AS "freshItems",
     COUNT(*) FILTER (WHERE expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 3)::int AS "expiringSoonItems",
     COUNT(*) FILTER (WHERE expires_at < CURRENT_DATE)::int AS "expiredItems",
     COUNT(*) FILTER (WHERE expires_at IS NULL)::int AS "noExpiryItems"
     FROM user_ingredients WHERE user_id = $1 AND quantity > 0`, [req.user.userId]);
  res.json(result.rows[0]);
});

module.exports = { categories, units, summary };
