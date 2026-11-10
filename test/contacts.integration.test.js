const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomInt } = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = require("../server");
const pool = require("../src/config/database");
const spec = require("../src/config/swagger");

const password = "ContactTest123";
const prefix = `contact-${randomUUID()}`;
const phone = `+1999${randomInt(10000000, 100000000)}`;
const users = [];
let server, baseUrl;

const request = async (path, body, token = users[0].token, method = "PUT") => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  const hash = await bcrypt.hash(password, 4);
  for (let index = 0; index < 3; index++) {
    const email = `${prefix}-${index}@example.com`;
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id", [email, hash]);
    const id = result.rows[0].id;
    users.push({ id, email, token: jwt.sign({ userId: id, role: "USER" }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" }) });
  }
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [users.map((user) => user.id)]);
  await pool.end();
});

test("Đổi liên hệ cần JWT, mật khẩu và dữ liệu đúng; không đổi dữ liệu khi lỗi", async () => {
  for (const field of ["email", "phone"]) {
    const path = `/api/settings/${field}`;
    const valid = field === "email" ? `${prefix}-new@example.com` : phone;
    assert.ok(spec.paths[path].put.security);
    assert.equal((await request(path, { [field]: valid, currentPassword: password }, null)).status, 401);
    assert.equal((await request(path, { [field]: valid })).status, 400);
    assert.equal((await request(path, { [field]: valid, currentPassword: "wrong-password" })).status, 401);
    for (const invalid of [null, 12345678, {}, "", "   ", field === "email" ? "not-an-email" : "090-123-4567"]) {
      assert.equal((await request(path, { [field]: invalid, currentPassword: password })).status, 400);
    }
    assert.equal((await request(path, undefined)).status, 400);
  }
  const result = await pool.query("SELECT email, phone FROM users WHERE id = $1", [users[0].id]);
  assert.equal(result.rows[0].email, users[0].email);
  assert.equal(result.rows[0].phone, null);
});

test("Đổi email của chính mình, chuẩn hóa, vô hiệu OTP cũ và đăng nhập bằng email mới", async () => {
  await pool.query(
    "INSERT INTO password_reset_otps (user_id, otp_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '5 minutes')",
    [users[0].id, await bcrypt.hash("123456", 4)]);
  const newEmail = `${prefix}-new@example.com`;
  const response = await request("/api/settings/email", {
    email: `  ${newEmail.toUpperCase()}  `,
    currentPassword: password,
    userId: users[1].id,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, users[0].id);
  assert.equal(response.body.user.email, newEmail);
  assert.equal(response.body.user.password_hash, undefined);
  const otp = await pool.query("SELECT used_at FROM password_reset_otps WHERE user_id = $1", [users[0].id]);
  assert.ok(otp.rows[0].used_at);
  assert.equal((await request("/api/auth/login", { identifier: users[0].email, password }, null, "POST")).status, 401);
  assert.equal((await request("/api/auth/login", { identifier: newEmail.toUpperCase(), password }, null, "POST")).status, 200);
  const other = await pool.query("SELECT email FROM users WHERE id = $1", [users[1].id]);
  assert.equal(other.rows[0].email, users[1].email);
  assert.equal((await request("/api/settings/email", {
    email: users[1].email.toUpperCase(), currentPassword: password,
  })).status, 409);
  assert.equal((await request("/api/auth/register", {
    email: newEmail.toUpperCase(), password,
  }, null, "POST")).status, 409);
});

test("Đổi số điện thoại, kiểm tra trùng và cập nhật hồ sơ", async () => {
  const response = await request("/api/settings/phone", { phone: `  ${phone}  `, currentPassword: password });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.phone, phone);
  assert.equal((await request("/api/auth/login", { identifier: phone, password }, null, "POST")).status, 200);
  assert.equal((await request("/api/settings/phone", { phone, currentPassword: password }, users[1].token)).status, 409);
  const profile = await request("/api/settings/profile", undefined, users[0].token, "GET");
  assert.equal(profile.body.user.phone, phone);
  const localPhone = `0${randomInt(100000000, 1000000000)}`;
  const changed = await request("/api/settings/phone", { phone: localPhone, currentPassword: password });
  assert.equal(changed.body.user.phone, localPhone, "Giữ nguyên số 0 ở đầu");
  const oldPhoneLogin = await request("/api/auth/login", { identifier: phone, password }, null, "POST");
  assert.equal(oldPhoneLogin.status, 401);
  const newPhoneLogin = await request("/api/auth/login", { identifier: localPhone, password }, null, "POST");
  assert.equal(newPhoneLogin.status, 200);
  assert.equal(newPhoneLogin.body.user.id, users[0].id);
});

test("Hai tài khoản đổi cùng email đồng thời chỉ một tài khoản thành công", async () => {
  const email = `${prefix}-race@example.com`;
  const responses = await Promise.all(users.slice(1).map((user, index) => request(
    "/api/settings/email", { email: index ? email.toUpperCase() : email, currentPassword: password }, user.token)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE LOWER(email) = $1", [email]);
  assert.equal(result.rows[0].count, 1);
});
