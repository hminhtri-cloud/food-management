const pool = require("../../config/database");
const { fail, id, endpoint } = require("../../services/adminService");

const date = (value, field) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail(400, `${field} phải là ngày hợp lệ YYYY-MM-DD`);
  }
  return value;
};
const period = (query) => {
  const to = query.to === undefined ? new Date().toISOString().slice(0, 10) : date(query.to, "to");
  const start = new Date(`${to}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  const defaultFrom = start.getUTCFullYear() < 1 ? "0001-01-01" : start.toISOString().slice(0, 10);
  const from = query.from === undefined ? defaultFrom : date(query.from, "from");
  if (from > to) fail(400, "from phải nhỏ hơn hoặc bằng to");
  return { from, to, timezone: "UTC" };
};
// Bao gồm toàn bộ ngày to theo UTC, không phụ thuộc timezone của PostgreSQL.
const inPeriod = (column) => `${column} >= ($1::date::timestamp AT TIME ZONE 'UTC')
  AND ${column} < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')`;

const overview = endpoint(async (req, res) => {
  const range = period(req.query);
  const result = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS "totalUsers",
       (SELECT COUNT(*)::int FROM users WHERE status = 'ACTIVE') AS "activeUsers",
       (SELECT COUNT(*)::int FROM users WHERE status = 'LOCKED') AS "lockedUsers",
       (SELECT COUNT(*)::int FROM users WHERE status = 'DELETED') AS "deletedUsers",
       (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN') AS "adminUsers",
       (SELECT COUNT(*)::int FROM recipes) AS "totalRecipes",
       (SELECT COUNT(*)::int FROM ingredients) AS "totalIngredients",
       (SELECT COUNT(*)::int FROM regions) AS "totalRegions",
       (SELECT COUNT(*)::int FROM favorites) AS "totalFavorites",
       (SELECT COUNT(*)::int FROM users WHERE ${inPeriod("created_at")}) AS "newUsers",
       (SELECT COUNT(*)::int FROM recipes WHERE ${inPeriod("created_at")}) AS "newRecipes",
       (SELECT COUNT(*)::int FROM recipe_events WHERE event_type = 'VIEW' AND ${inPeriod("created_at")}) AS "recipeViews",
       (SELECT COUNT(*)::int FROM recipe_events WHERE event_type = 'RECOMMENDATION' AND ${inPeriod("created_at")}) AS "recipeRecommendations",
       (SELECT COUNT(*)::int FROM ai_usage_events WHERE ${inPeriod("created_at")}) AS "aiCalls"`, [range.from, range.to]);
  res.json({ period: range, statistics: result.rows[0] });
});

const recipes = endpoint(async (req, res) => {
  const range = period(req.query);
  const limit = req.query.limit === undefined ? 10 : id(req.query.limit, "limit");
  if (limit > 100) fail(400, "limit tối đa 100");
  const params = [range.from, range.to];
  const aggregate = `SELECT r.id, r.name, r.region_id AS "regionId",
    COUNT(*) FILTER (WHERE e.event_type = 'VIEW')::int AS views,
    COUNT(*) FILTER (WHERE e.event_type = 'RECOMMENDATION')::int AS recommendations
    FROM recipe_events e JOIN recipes r ON r.id = e.recipe_id
    WHERE ${inPeriod("e.created_at")} GROUP BY r.id`;
  const [totals, topViewed, topRecommended, daily] = await Promise.all([
    pool.query(`SELECT COUNT(*) FILTER (WHERE event_type = 'VIEW')::int AS views,
      COUNT(*) FILTER (WHERE event_type = 'RECOMMENDATION')::int AS recommendations
      FROM recipe_events WHERE ${inPeriod("created_at")}`, params),
    pool.query(`SELECT * FROM (${aggregate}) counts WHERE views > 0 ORDER BY views DESC, id ASC LIMIT $3`, [...params, limit]),
    pool.query(`SELECT * FROM (${aggregate}) counts WHERE recommendations > 0 ORDER BY recommendations DESC, id ASC LIMIT $3`, [...params, limit]),
    pool.query(`SELECT (created_at AT TIME ZONE 'UTC')::date::text AS date,
      COUNT(*) FILTER (WHERE event_type = 'VIEW')::int AS views,
      COUNT(*) FILTER (WHERE event_type = 'RECOMMENDATION')::int AS recommendations
      FROM recipe_events WHERE ${inPeriod("created_at")} GROUP BY 1 ORDER BY 1`, params),
  ]);
  res.json({ period: range, totals: totals.rows[0], topViewed: topViewed.rows, topRecommended: topRecommended.rows, daily: daily.rows });
});

const ai = endpoint(async (req, res) => {
  const range = period(req.query);
  const params = [range.from, range.to];
  const metrics = `COUNT(*)::int AS calls,
    COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS "successCalls",
    COUNT(*) FILTER (WHERE status = 'ERROR')::int AS "errorCalls",
    COUNT(DISTINCT user_id)::int AS "uniqueUsers",
    COALESCE(SUM(input_tokens), 0)::float8 AS "inputTokens",
    COALESCE(SUM(output_tokens), 0)::float8 AS "outputTokens"`;
  const [totals, byModel, daily] = await Promise.all([
    pool.query(`SELECT ${metrics} FROM ai_usage_events WHERE ${inPeriod("created_at")}`, params),
    pool.query(`SELECT provider, model, operation, ${metrics} FROM ai_usage_events
      WHERE ${inPeriod("created_at")} GROUP BY provider, model, operation ORDER BY calls DESC, provider, model, operation`, params),
    pool.query(`SELECT (created_at AT TIME ZONE 'UTC')::date::text AS date, ${metrics}
      FROM ai_usage_events WHERE ${inPeriod("created_at")} GROUP BY 1 ORDER BY 1`, params),
  ]);
  res.json({ period: range, totals: totals.rows[0], byModel: byModel.rows, daily: daily.rows });
});

module.exports = { overview, recipes, ai };
