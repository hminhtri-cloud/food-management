const pool = require("../config/database");
const { positiveId } = require("./recipeService");

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const id = (value, field = "id") => {
  if (!["string", "number"].includes(typeof value)) fail(400, `${field} phải là số nguyên dương`);
  return positiveId(value) || fail(400, `${field} phải là số nguyên dương`);
};
const text = (value, field, max, nullable = false) => {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    fail(400, `${field} phải là chuỗi không rỗng, tối đa ${max} ký tự`);
  }
  return value.trim();
};
const url = (value, field, nullable = false) => {
  if (nullable && value === null) return null;
  const result = text(value, field, 2048);
  try {
    const parsed = new URL(result);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
  } catch { fail(400, `${field} phải là URL http/https hợp lệ`); }
  return result;
};
const body = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "Body phải là JSON object");
  return value;
};
const paging = (query) => {
  const page = query.page === undefined ? 1 : id(query.page, "page");
  const limit = query.limit === undefined ? 20 : id(query.limit, "limit");
  if (limit > 100) fail(400, "limit tối đa 100");
  if (query.search !== undefined && typeof query.search !== "string") fail(400, "search phải là chuỗi");
  return { page, limit, offset: (page - 1) * limit, search: (query.search || "").trim() };
};
const pagination = (total, { page, limit }) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
const transaction = async (work) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
};
const endpoint = (handler) => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === "23505") return res.status(409).json({ message: "Tên hoặc slug đã tồn tại" });
    if (error.code === "23503") return res.status(409).json({ message: "Dữ liệu tham chiếu không tồn tại hoặc bản ghi đang được sử dụng" });
    console.error(error);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
};
const exists = async (client, table, value, field) => {
  // table chỉ được truyền từ hằng số trong controller, không lấy từ request.
  const result = await client.query(`SELECT id FROM ${table} WHERE id = $1 FOR KEY SHARE`, [value]);
  if (!result.rows.length) fail(400, `${field} không tồn tại`);
};

module.exports = { fail, id, text, url, body, paging, pagination, transaction, endpoint, exists };
