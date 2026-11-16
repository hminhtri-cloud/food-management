const pool = require("../../config/database");
const { fail, id, body, paging, pagination, transaction, endpoint } = require("../../services/adminService");

const columns = 'id, email, phone, full_name AS "fullName", avatar_url AS "avatarUrl", role, status, created_at AS "createdAt", updated_at AS "updatedAt"';
const getUser = async (client, userId, lock = false) => {
  const result = await client.query(`SELECT ${columns} FROM users WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [userId]);
  if (!result.rows.length) fail(404, "Không tìm thấy người dùng");
  return result.rows[0];
};

const list = endpoint(async (req, res) => {
  const filters = paging(req.query);
  const params = [`%${filters.search}%`];
  let where = "WHERE (full_name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)";
  for (const [field, values] of [["role", ["USER", "ADMIN"]], ["status", ["ACTIVE", "LOCKED", "DELETED"]]]) {
    if (req.query[field] !== undefined) {
      if (!values.includes(req.query[field])) fail(400, `${field} không hợp lệ`);
      params.push(req.query[field]);
      where += ` AND ${field} = $${params.length}`;
    }
  }
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, params);
  const result = await pool.query(
    `SELECT ${columns} FROM users ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, filters.limit, filters.offset]);
  res.json({ users: result.rows, pagination: pagination(count.rows[0].total, filters) });
});
const get = endpoint(async (req, res) => res.json({ user: await getUser(pool, id(req.params.id)) }));
const updateStatus = endpoint(async (req, res) => {
  const userId = id(req.params.id);
  const { status } = body(req.body);
  if (!["ACTIVE", "LOCKED"].includes(status)) fail(400, "status chỉ nhận ACTIVE hoặc LOCKED");
  if (userId === req.user.userId && status === "LOCKED") fail(400, "Không thể tự khóa tài khoản đang sử dụng");
  const user = await transaction(async (client) => {
    const current = await getUser(client, userId, true);
    if (current.status === "DELETED") fail(409, "Không thể khóa/mở khóa tài khoản đã xóa");
    await client.query("UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2", [status, userId]);
    if (status === "LOCKED") {
      await client.query("UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = $1", [userId]);
    }
    return getUser(client, userId);
  });
  res.json({ user });
});

module.exports = { list, get, updateStatus };
