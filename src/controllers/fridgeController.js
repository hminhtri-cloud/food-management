const { pool, endpoint, body, id, text, quantity, date, fail } = require("../services/workflowService");

// Giữ tương thích timestamp ISO của form cũ; database vẫn lưu ngày lịch YYYY-MM-DD.
const expiry = (value) => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) {
    return date(value.slice(0, 10));
  }
  return date(value);
};
const addIngredient = endpoint(async (req, res) => {
  const data = body(req.body);
  const ingredientId = id(data.ingredientId, "ingredientId");
  const unit = text(data.unit, "unit", 30);
  const amount = quantity(data.quantity === undefined ? 0 : data.quantity, "quantity", true);
  const expiresAt = data.expiresAt === undefined ? null : expiry(data.expiresAt);
  if (!(await pool.query("SELECT id FROM ingredients WHERE id = $1", [ingredientId])).rows.length) fail(404, "Không tìm thấy nguyên liệu");
  const result = await pool.query(
    `INSERT INTO user_ingredients (user_id, ingredient_id, quantity, unit, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id, ingredient_id, quantity, unit, expires_at::text AS expires_at`,
    [req.user.userId, ingredientId, amount, unit, expiresAt]);
  res.status(201).json({ message: "Thêm nguyên liệu vào tủ lạnh thành công", ingredient: result.rows[0] });
});

const getFridgeIngredients = endpoint(async (req, res) => {
  const params = [req.user.userId];
  let where = "WHERE ui.user_id = $1";
  if (req.query.categoryId !== undefined) {
    params.push(id(req.query.categoryId, "categoryId"));
    where += ` AND i.category_id = $${params.length}`;
  }
  const statuses = {
    NO_EXPIRY: "ui.expires_at IS NULL", EXPIRED: "ui.expires_at < CURRENT_DATE",
    EXPIRING_SOON: "ui.expires_at BETWEEN CURRENT_DATE AND CURRENT_DATE + 3", FRESH: "ui.expires_at > CURRENT_DATE + 3",
  };
  if (req.query.expiryStatus !== undefined) {
    if (typeof req.query.expiryStatus !== "string" || !Object.hasOwn(statuses, req.query.expiryStatus)) fail(400, "expiryStatus không hợp lệ");
    where += ` AND (${statuses[req.query.expiryStatus]}) AND ui.quantity > 0`;
  }
  const result = await pool.query(
    `SELECT ui.id, ui.quantity, ui.unit, ui.expires_at::text AS expires_at, i.id AS ingredient_id,
     i.name, i.category_id, c.name AS category_name,
     CASE WHEN ui.expires_at IS NULL THEN 'NO_EXPIRY' WHEN ui.expires_at < CURRENT_DATE THEN 'EXPIRED'
          WHEN ui.expires_at <= CURRENT_DATE + 3 THEN 'EXPIRING_SOON' ELSE 'FRESH' END AS expiry_status
     FROM user_ingredients ui JOIN ingredients i ON i.id = ui.ingredient_id
     LEFT JOIN ingredient_categories c ON c.id = i.category_id ${where}
     ORDER BY ui.expires_at ASC NULLS LAST, i.name ASC, ui.id ASC`, params);
  res.json({ ingredients: result.rows });
});

const updateFridgeIngredient = endpoint(async (req, res) => {
  const recordId = id(req.params.id);
  const data = body(req.body);
  if (!["quantity", "unit", "expiresAt"].some((key) => Object.hasOwn(data, key))) fail(400, "Cần ít nhất một trường để cập nhật");
  const amount = data.quantity === undefined ? null : quantity(data.quantity, "quantity", true);
  const unit = data.unit === undefined ? null : text(data.unit, "unit", 30);
  const hasExpiry = Object.hasOwn(data, "expiresAt");
  const expiresAt = hasExpiry ? expiry(data.expiresAt) : null;
  const result = await pool.query(
    `UPDATE user_ingredients SET quantity = COALESCE($1, quantity), unit = COALESCE($2, unit),
     expires_at = CASE WHEN $4 THEN $3::date ELSE expires_at END, updated_at = NOW()
     WHERE id = $5 AND user_id = $6 RETURNING id, user_id, ingredient_id, quantity, unit, expires_at::text AS expires_at`,
    [amount, unit, expiresAt, hasExpiry, recordId, req.user.userId]);
  if (!result.rows.length) fail(404, "Không tìm thấy nguyên liệu trong tủ lạnh");
  res.json({ message: "Cập nhật nguyên liệu thành công", ingredient: result.rows[0] });
});
const deleteFridgeIngredient = endpoint(async (req, res) => {
  const result = await pool.query("DELETE FROM user_ingredients WHERE id = $1 AND user_id = $2 RETURNING id", [id(req.params.id), req.user.userId]);
  if (!result.rows.length) fail(404, "Không tìm thấy nguyên liệu trong tủ lạnh");
  res.json({ message: "Xóa nguyên liệu thành công" });
});

module.exports = { addIngredient, getFridgeIngredients, updateFridgeIngredient, deleteFridgeIngredient };
