const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userApp = require("../server");
const adminApp = require("../admin-server");
const pool = require("../src/config/database");
const userSpec = require("../src/config/swagger");
const adminSpec = require("../src/config/adminSwagger");

const accounts = {};
const servers = [];
const urls = {};
const sessions = {};

const call = async (portal, path, { method = "GET", body, token } = {}) => {
  const response = await fetch(urls[portal] + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  const passwordHash = await bcrypt.hash("PortalTest123", 4);
  for (const role of ["USER", "ADMIN"]) {
    const email = `portal-${randomUUID()}@example.com`;
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
      [email, passwordHash, role]);
    accounts[role] = { id: result.rows[0].id, email };
  }
  for (const [portal, app] of [["user", userApp], ["admin", adminApp]]) {
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise((resolve) => server.once("listening", resolve));
    urls[portal] = `http://127.0.0.1:${server.address().port}`;
  }
});

after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [Object.values(accounts).map((item) => item.id)]);
  await pool.end();
});

test("Hai cổng độc lập, Swagger tách biệt, không mount API sai cổng", async () => {
  assert.notEqual(urls.user, urls.admin);
  assert.equal((await call("user", "/api/health")).body.portal, "user");
  assert.equal((await call("admin", "/api/health")).body.portal, "admin");
  assert.ok(userSpec.paths["/api/recipes"]);
  assert.ok(!userSpec.paths["/api/auth/admin-test"]);
  assert.ok(adminSpec.paths["/api/auth/admin-test"]);
  assert.ok(!adminSpec.paths["/api/recipes"]);
  assert.ok(!adminSpec.paths["/api/auth/register"]);
  assert.equal((await call("user", "/api/auth/admin-test")).status, 404);
  assert.equal((await call("admin", "/api/fridge")).status, 404);
  assert.equal((await call("admin", "/api/auth/register", { method: "POST", body: {} })).status, 404);
  // Cả hai app được import cùng process cũng không được dùng nhầm swagger-ui-init.
  for (const portal of ["admin", "user", "admin"]) {
    const html = await fetch(urls[portal]);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /swagger-ui/);
    const init = await (await fetch(`${urls[portal]}/swagger-ui-init.js`)).text();
    assert.ok(init.includes(`Food Management - ${portal === "admin" ? "Admin" : "User"} API`));
    assert.equal(init.includes('"/api/auth/admin-test"'), portal === "admin");
  }
});

test("Đăng nhập đúng cổng; sai role bị từ chối trước khi tạo phiên", async () => {
  for (const [portal, role] of [["user", "USER"], ["admin", "ADMIN"]]) {
    const account = accounts[role];
    const login = await call(portal, "/api/auth/login", {
      method: "POST", body: { identifier: account.email, password: "PortalTest123" },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, role);
    sessions[portal] = login.body;
    const wrongPortal = portal === "user" ? "admin" : "user";
    const denied = await call(wrongPortal, "/api/auth/login", {
      method: "POST", body: { identifier: account.email, password: "PortalTest123" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.accessToken, undefined);
    const count = await pool.query("SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id = $1", [account.id]);
    assert.equal(count.rows[0].count, 1);
  }
});

test("Access/refresh token không dùng chéo role; logout chỉ tác động phiên đúng cổng", async () => {
  for (const portal of ["user", "admin"]) {
    const other = portal === "user" ? "admin" : "user";
    assert.equal((await call(portal, "/api/auth/me")).status, 401);
    assert.equal((await call(portal, "/api/auth/me", { token: sessions[portal].accessToken })).status, 200);
    assert.equal((await call(other, "/api/auth/me", { token: sessions[portal].accessToken })).status, 403);
    assert.equal((await call(other, "/api/auth/refresh", {
      method: "POST", body: { refreshToken: sessions[portal].refreshToken },
    })).status, 403);
    await call(other, "/api/auth/logout", {
      method: "POST", body: { refreshToken: sessions[portal].refreshToken },
    });
    assert.equal((await call(portal, "/api/auth/refresh", {
      method: "POST", body: { refreshToken: sessions[portal].refreshToken },
    })).status, 200);
  }
  assert.equal((await call("admin", "/api/auth/admin-test", { token: sessions.admin.accessToken })).status, 200);
  assert.equal((await call("admin", "/api/auth/admin-test", { token: sessions.user.accessToken })).status, 403);
  // Role giả mạo/cũ trong JWT không được vượt qua role hiện tại trong DB.
  const staleRoleToken = jwt.sign({ userId: accounts.USER.id, role: "ADMIN" }, process.env.JWT_ACCESS_SECRET);
  assert.equal((await call("admin", "/api/auth/admin-test", { token: staleRoleToken })).status, 403);
  await pool.query("UPDATE users SET status = 'LOCKED' WHERE id = $1", [accounts.ADMIN.id]);
  assert.equal((await call("admin", "/api/auth/me", { token: sessions.admin.accessToken })).status, 401);
});
