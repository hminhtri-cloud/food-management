const pool = require("../config/database");
const { fail, id, text, body, paging, pagination, transaction, exists } = require("./adminService");

const endpoint = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, ...(error.details ? { details: error.details } : {}) });
    if (["23503", "23505", "23514", "22003"].includes(error.code)) {
      return res.status(409).json({ message: "Dữ liệu đang được sử dụng, trùng hoặc số lượng vượt giới hạn" });
    }
    console.error(error);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
};
const quantity = (value, field = "quantity", allowZero = false) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < (allowZero ? 0 : 0.01)
    || value > 99999999.99 || Number(value.toFixed(2)) !== value) {
    fail(400, `${field} phải ${allowZero ? ">= 0" : "> 0"}, tối đa 99999999.99 và 2 chữ số thập phân`);
  }
  return value;
};
const date = (value, field = "expiresAt") => {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail(400, `${field} phải là ngày YYYY-MM-DD hợp lệ hoặc null`);
  }
  return value;
};
const boolean = (value, field) => {
  if (typeof value !== "boolean") fail(400, `${field} phải là boolean`);
  return value;
};
const servings = (value = 1) => {
  if (!Number.isInteger(value) || value < 1 || value > 100) fail(400, "servings phải là số nguyên từ 1 đến 100");
  return value;
};
const lockUser = (client, userId) => client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
const cents = (value) => Math.round(Number(value) * 100);
const normalize = (value) => value.trim().toLocaleLowerCase("vi");
const getUnits = async (client = pool) => (await client.query(
  'SELECT code, name, conversion_group AS "conversionGroup", base_factor AS "baseFactor", aliases FROM units ORDER BY conversion_group, base_factor, code')).rows;
const unitInfo = (unit, units) => {
  const code = normalize(unit);
  const item = units.find((item) => item.code === code || item.aliases.includes(code));
  return item ? { code: item.code, group: item.conversionGroup, factor: item.baseFactor }
    : { code, group: `custom:${code}`, factor: 1 };
};
const recipe = async (client, recipeId) => {
  const result = await client.query("SELECT id, name FROM recipes WHERE id = $1 FOR SHARE", [recipeId]);
  if (!result.rows.length) fail(404, "Không tìm thấy công thức");
  const ingredients = await client.query(
    `SELECT ri.ingredient_id AS "ingredientId", i.name, ri.quantity::float8 AS quantity, ri.unit
     FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id WHERE recipe_id = $1 ORDER BY ri.ingredient_id`, [recipeId]);
  if (!ingredients.rows.length) fail(409, "Công thức chưa có nguyên liệu");
  return { ...result.rows[0], ingredients: ingredients.rows };
};

module.exports = { pool, fail, id, text, body, paging, pagination, transaction, exists, endpoint,
  quantity, date, boolean, servings, lockUser, cents, normalize, getUnits, unitInfo, recipe };
