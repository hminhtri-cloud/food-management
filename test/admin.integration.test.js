const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const adminApp = require("../admin-server");
const userApp = require("../server");
const pool = require("../src/config/database");
const { recordAiUsage } = require("../src/services/analyticsService");

const prefix = `adm-${randomUUID()}`;
const ids = { users: [], recipes: [], ingredients: [], regions: [] };
let adminServer, userServer, adminUrl, userUrl, adminToken, userToken, adminId, userId, deletedId, categoryId;
let regionId, ingredientId, recipeId;
const call = async (path, method = "GET", data, token = adminToken, base = adminUrl) => {
  const response = await fetch(`${base}${path}`, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result = { status: response.status, body: await response.json() };
  if (response.status === 201) {
    for (const [key, resource] of [["recipe", "recipes"], ["ingredient", "ingredients"], ["region", "regions"]]) {
      if (result.body[key]) ids[resource].push(result.body[key].id);
    }
  }
  return result;
};
const sign = (userId, role) => jwt.sign({ userId, role }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" });
const listen = async (app) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return server;
};

before(async () => {
  for (const [index, role, status] of [[0, "ADMIN", "ACTIVE"], [1, "USER", "ACTIVE"], [2, "USER", "DELETED"]]) {
    const result = await pool.query(
      "INSERT INTO users (email, full_name, password_hash, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [`${prefix}-${index}@example.com`, prefix, "test-no-login", role, status]);
    ids.users.push(result.rows[0].id);
  }
  [adminId, userId, deletedId] = ids.users;
  adminToken = sign(adminId, "USER"); // Quyền thực tế phải lấy từ DB, không lấy claim cũ.
  userToken = sign(userId, "ADMIN");
  categoryId = (await pool.query("INSERT INTO ingredient_categories (name) VALUES ($1) RETURNING id", [prefix])).rows[0].id;
  adminServer = await listen(adminApp);
  userServer = await listen(userApp);
  adminUrl = `http://127.0.0.1:${adminServer.address().port}`;
  userUrl = `http://127.0.0.1:${userServer.address().port}`;
});

after(async () => {
  for (const server of [adminServer, userServer]) {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  try {
    await pool.query("DELETE FROM ai_usage_events WHERE provider = $1", [prefix]);
    await pool.query("DELETE FROM recipes WHERE id = ANY($1::int[])", [ids.recipes]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [ids.users]);
    await pool.query("DELETE FROM ingredients WHERE id = ANY($1::int[])", [ids.ingredients]);
    await pool.query("DELETE FROM regions WHERE id = ANY($1::int[])", [ids.regions]);
    if (categoryId) await pool.query("DELETE FROM ingredient_categories WHERE id = $1", [categoryId]);
  } finally { await pool.end(); }
});

test("21 endpoint đều bắt buộc đăng nhập ADMIN theo role hiện tại trong DB", async () => {
  const endpoints = [];
  for (const resource of ["recipes", "ingredients", "regions"]) {
    endpoints.push([`/${resource}`, "GET"], [`/${resource}/1`, "GET"], [`/${resource}`, "POST"], [`/${resource}/1`, "PUT"], [`/${resource}/1`, "DELETE"]);
  }
  endpoints.push(["/users", "GET"], ["/users/1", "GET"], ["/users/1/status", "PATCH"],
    ["/statistics/overview", "GET"], ["/statistics/recipes", "GET"], ["/statistics/ai", "GET"]);
  assert.equal(endpoints.length, 21);
  for (const [path, method] of endpoints) {
    const data = ["POST", "PUT", "PATCH"].includes(method) ? {} : undefined;
    assert.equal((await call(`/api/admin${path}`, method, data, null)).status, 401, `${method} ${path}`);
    assert.equal((await call(`/api/admin${path}`, method, data, userToken)).status, 403, `${method} ${path}`);
  }
  assert.equal((await call("/api/admin/regions", "GET", undefined, adminToken)).status, 200);
  assert.equal((await call("/api/admin/regions", "GET", undefined, userToken, userUrl)).status, 404);
  const spec = require("../src/config/adminSwagger");
  assert.equal(Object.entries(spec.paths).filter(([path]) => path.startsWith("/api/admin/"))
    .reduce((sum, [, operations]) => sum + Object.keys(operations).length, 0), 21);
});

test("CRUD vùng miền: phân trang, tìm kiếm, trùng tên, dữ liệu và ID lỗi", async () => {
  const created = await call("/api/admin/regions", "POST", { name: `${prefix}-region` });
  assert.equal(created.status, 201);
  regionId = created.body.region.id;
  assert.equal((await call(`/api/admin/regions/${regionId}`)).body.region.name, `${prefix}-region`);
  assert.equal((await call("/api/admin/regions", "POST", { name: `${prefix}-region` })).status, 409);
  const list = await call(`/api/admin/regions?search=${prefix}&limit=1`);
  assert.equal(list.body.pagination.total, 1);
  assert.equal(list.body.regions.length, 1);
  assert.equal((await call(`/api/admin/regions?search=${prefix}&limit=1&page=2`)).body.regions.length, 0);
  assert.equal((await call(`/api/admin/regions/${regionId}`, "PUT", { name: `${prefix}-renamed` })).status, 200);
  for (const data of [{ name: " " }, { name: "x".repeat(51) }, null, [], {}]) {
    assert.equal((await call("/api/admin/regions", "POST", data)).status, 400);
  }
  assert.equal((await call(`/api/admin/regions/${regionId}`, "PUT", {})).status, 400);
  for (const path of ["/regions/nope", "/regions?limit=101", "/regions?page=-1", "/regions?search=a&search=b"]) {
    assert.equal((await call(`/api/admin${path}`)).status, 400);
  }
  assert.equal((await call("/api/admin/regions/2147483647")).status, 404);
  const malformed = await fetch(`${adminUrl}/api/admin/regions`, {
    method: "POST", headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" }, body: '{"name":',
  });
  assert.equal(malformed.status, 400);
  assert.equal(typeof (await malformed.json()).message, "string");
});

test("CRUD nguyên liệu: kiểm tra nhóm, cập nhật và xóa trường nullable", async () => {
  assert.equal((await call("/api/admin/ingredients", "POST", { name: prefix, categoryId: 2147483647 })).status, 400);
  const created = await call("/api/admin/ingredients", "POST", { name: prefix, categoryId, defaultUnit: "kg" });
  assert.equal(created.status, 201);
  ingredientId = created.body.ingredient.id;
  const detail = await call(`/api/admin/ingredients/${ingredientId}`);
  assert.equal(detail.body.ingredient.categoryId, categoryId);
  assert.equal((await call(`/api/admin/ingredients?search=${prefix}&categoryId=${categoryId}`)).body.pagination.total, 1);
  assert.equal((await call("/api/admin/ingredients", "POST", { name: prefix })).status, 409);
  const updated = await call(`/api/admin/ingredients/${ingredientId}`, "PUT", { defaultUnit: null, categoryId: null });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.ingredient.categoryId, null);
  assert.equal(updated.body.ingredient.defaultUnit, null);
  assert.equal((await call(`/api/admin/ingredients/${ingredientId}`, "PUT", { categoryId, defaultUnit: "kg" })).status, 200);
});

test("CRUD công thức: nguyên liệu, URL, rollback và bảo vệ tham chiếu", async () => {
  const payload = { name: `${prefix}-recipe`, slug: `${prefix}-recipe`, regionId, imageUrl: "https://example.com/image.jpg",
    sourceUrl: "https://example.com/guide", ingredients: [{ ingredientId, quantity: 1.25, unit: "kg" }] };
  for (const override of [
    { ingredients: [] }, { ingredients: [{ ingredientId, quantity: -1, unit: "kg" }] },
    { ingredients: [{ ingredientId, quantity: 0.001, unit: "kg" }] }, { ingredients: [null] },
    { ingredients: [{ ingredientId, quantity: 1e-10, unit: "kg" }] },
    { ingredients: [...payload.ingredients, ...payload.ingredients] },
    { ingredients: [{ ingredientId: 2147483647, quantity: 1, unit: "kg" }] },
    { sourceUrl: "javascript:alert(1)" }, { imageUrl: "not-url" }, { slug: "BAD slug" }, { regionId: 2147483647 },
  ]) {
    assert.equal((await call("/api/admin/recipes", "POST", { ...payload, ...override })).status, 400);
  }
  assert.equal((await call(`/api/admin/recipes?search=${prefix}`)).body.pagination.total, 0);
  const created = await call("/api/admin/recipes", "POST", payload);
  assert.equal(created.status, 201);
  recipeId = created.body.recipe.id;
  assert.equal(created.body.recipe.ingredients[0].quantity, 1.25);
  assert.equal((await call("/api/admin/recipes", "POST", payload)).status, 409);
  assert.equal((await call(`/api/admin/recipes?regionId=${regionId}&search=${prefix}`)).body.pagination.total, 1);
  assert.equal((await call(`/api/admin/recipes/${recipeId}`)).body.recipe.ingredients.length, 1);
  assert.equal((await call(`/api/admin/recipes/${recipeId}`, "PUT", { name: "must rollback", ingredients: [] })).status, 400);
  assert.equal((await call(`/api/admin/recipes/${recipeId}`)).body.recipe.name, payload.name);
  const updated = await call(`/api/admin/recipes/${recipeId}`, "PUT", {
    imageUrl: null, ingredients: [{ ingredientId, quantity: 2, unit: "g" }],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.recipe.imageUrl, null);
  assert.equal(updated.body.recipe.ingredients[0].quantity, 2);
  assert.equal(updated.body.recipe.ingredients[0].unit, "g");
  assert.equal((await call(`/api/admin/ingredients/${ingredientId}`, "DELETE")).status, 409);
  assert.equal((await call(`/api/admin/regions/${regionId}`, "DELETE")).status, 409);
  // Hai cập nhật một phần đồng thời không được ghi đè trường vừa được request kia sửa.
  const results = await Promise.all([
    call(`/api/admin/recipes/${recipeId}`, "PUT", { name: `${prefix}-updated` }),
    call(`/api/admin/recipes/${recipeId}`, "PUT", { sourceUrl: "https://example.com/new" }),
  ]);
  assert.ok(results.every((result) => result.status === 200));
  const final = (await call(`/api/admin/recipes/${recipeId}`)).body.recipe;
  assert.equal(final.name, `${prefix}-updated`);
  assert.equal(final.sourceUrl, "https://example.com/new");
});

test("Quản lý user: không lộ hash, khóa có hiệu lực ngay và thu hồi refresh token", async () => {
  const list = await call(`/api/admin/users?search=${prefix}&role=USER&status=ACTIVE&limit=1`);
  assert.equal(list.body.pagination.total, 1);
  assert.equal(list.body.users[0].id, userId);
  assert.ok(!JSON.stringify(list.body).includes("password_hash"));
  assert.ok(!JSON.stringify(list.body).includes("test-no-login"));
  assert.equal((await call(`/api/admin/users/${userId}`)).body.user.id, userId);
  assert.equal((await call("/api/admin/users?status=nope")).status, 400);
  assert.equal((await call("/api/admin/users/2147483647")).status, 404);
  await pool.query("INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 day')", [userId, prefix]);
  assert.equal((await call(`/api/admin/users/${userId}/status`, "PATCH", { status: "LOCKED" })).status, 200);
  assert.equal((await call("/api/auth/me", "GET", undefined, userToken, userUrl)).status, 401);
  assert.ok((await pool.query("SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1", [prefix])).rows[0].revoked_at);
  assert.equal((await call(`/api/admin/users/${userId}/status`, "PATCH", { status: "ACTIVE" })).status, 200);
  assert.equal((await call("/api/auth/me", "GET", undefined, userToken, userUrl)).status, 200);
  assert.ok((await pool.query("SELECT revoked_at FROM refresh_tokens WHERE token_hash = $1", [prefix])).rows[0].revoked_at);
  assert.equal((await call(`/api/admin/users/${adminId}/status`, "PATCH", { status: "LOCKED" })).status, 400);
  assert.equal((await call(`/api/admin/users/${deletedId}/status`, "PATCH", { status: "ACTIVE" })).status, 409);
  assert.equal((await call(`/api/admin/users/${userId}/status`, "PATCH", { status: "DELETED" })).status, 400);
});

test("Thống kê ghi đúng lượt xem và lượt xuất hiện trong trang gợi ý thực tế", async () => {
  const beforeCount = (await pool.query("SELECT COUNT(*)::int AS count FROM recipe_events WHERE recipe_id = $1", [recipeId])).rows[0].count;
  assert.equal((await call(`/api/recipes/${recipeId}`, "GET", undefined, userToken, userUrl)).status, 200);
  const recommendations = await call(`/api/recipes/recommendations?search=${prefix}&regionIds=all&limit=1`, "GET", undefined, userToken, userUrl);
  assert.equal(recommendations.status, 200);
  assert.equal(recommendations.body.recipes[0].id, recipeId);
  await call(`/api/recipes/recommendations?search=${prefix}&regionIds=all&page=2&limit=1`, "GET", undefined, userToken, userUrl);
  await call("/api/recipes/2147483647", "GET", undefined, userToken, userUrl);
  const events = await pool.query("SELECT event_type FROM recipe_events WHERE recipe_id = $1 ORDER BY id", [recipeId]);
  assert.equal(events.rows.length - beforeCount, 2, "Không ghi cho trang rỗng hoặc công thức 404");
  assert.deepEqual(events.rows.slice(-2).map((event) => event.event_type), ["VIEW", "RECOMMENDATION"]);
});

test("3 dashboard: khoảng ngày UTC, xếp hạng, lượt AI, token và dữ liệu rỗng", async () => {
  await pool.query(
    `INSERT INTO recipe_events (user_id, recipe_id, event_type, created_at) VALUES
     ($1, $2, 'VIEW', '2001-02-01T00:00:00Z'), ($1, $2, 'VIEW', '2001-02-02T23:59:59Z'),
     ($1, $2, 'RECOMMENDATION', '2001-02-02T12:00:00Z'), ($1, $2, 'VIEW', '2001-02-03T00:00:00Z')`, [userId, recipeId]);
  await recordAiUsage({ userId, operation: "CHAT", provider: prefix, model: "test-model", status: "SUCCESS", inputTokens: 7, outputTokens: 3 });
  await recordAiUsage({ userId, operation: "CHAT", provider: prefix, model: "test-model", status: "ERROR" });
  await pool.query("UPDATE ai_usage_events SET created_at = '2001-02-02T23:59:59Z' WHERE provider = $1", [prefix]);
  const query = "?from=2001-02-01&to=2001-02-02";
  const recipeStats = await call(`/api/admin/statistics/recipes${query}&limit=100`);
  assert.equal(recipeStats.status, 200);
  const top = recipeStats.body.topViewed.find((recipe) => recipe.id === recipeId);
  assert.equal(top.views, 2);
  assert.equal(top.recommendations, 1);
  assert.ok(recipeStats.body.topRecommended.some((recipe) => recipe.id === recipeId));
  assert.equal(recipeStats.body.period.timezone, "UTC");
  const aiStats = await call(`/api/admin/statistics/ai${query}`);
  assert.equal(aiStats.status, 200);
  const model = aiStats.body.byModel.find((item) => item.provider === prefix);
  assert.equal(model.calls, 2);
  assert.equal(model.successCalls, 1);
  assert.equal(model.errorCalls, 1);
  assert.equal(model.uniqueUsers, 1);
  assert.equal(model.inputTokens, 7);
  assert.equal(model.outputTokens, 3);
  assert.equal(aiStats.body.daily[0].date, "2001-02-02");
  const overview = await call(`/api/admin/statistics/overview${query}`);
  assert.equal(overview.status, 200);
  assert.ok(overview.body.statistics.totalUsers >= 3);
  assert.ok(overview.body.statistics.totalRecipes >= 1);
  assert.equal(overview.body.statistics.recipeViews, recipeStats.body.totals.views);
  assert.equal(overview.body.statistics.aiCalls, aiStats.body.totals.calls);
  for (const path of ["overview?from=2026-02-30", "ai?from=2026-02-02&to=2026-02-01", "recipes?limit=101", "ai?to=nope", "ai?from=0000-01-01"]) {
    assert.equal((await call(`/api/admin/statistics/${path}`)).status, 400);
  }
  const empty = await call("/api/admin/statistics/ai?from=1999-01-01&to=1999-01-01");
  assert.deepEqual(empty.body.totals, { calls: 0, successCalls: 0, errorCalls: 0, uniqueUsers: 0, inputTokens: 0, outputTokens: 0 });
  assert.deepEqual(empty.body.byModel, []);
  assert.equal((await call("/api/admin/statistics/overview?to=0001-01-01")).status, 200);
});

test("Xóa công thức dọn liên kết; nguyên liệu trong tủ vẫn được bảo vệ", async () => {
  await pool.query("INSERT INTO favorites (user_id, recipe_id) VALUES ($1, $2)", [userId, recipeId]);
  assert.equal((await call(`/api/admin/recipes/${recipeId}`, "DELETE")).status, 200);
  for (const table of ["favorites", "recipe_ingredients", "recipe_events"]) {
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE recipe_id = $1`, [recipeId])).rows[0].count, 0);
  }
  assert.equal((await call(`/api/admin/recipes/${recipeId}`, "DELETE")).status, 404);
  await pool.query("INSERT INTO user_ingredients (user_id, ingredient_id, quantity, unit) VALUES ($1, $2, 1, 'kg')", [userId, ingredientId]);
  assert.equal((await call(`/api/admin/ingredients/${ingredientId}`, "DELETE")).status, 409);
  await pool.query("DELETE FROM user_ingredients WHERE user_id = $1", [userId]);
  assert.equal((await call(`/api/admin/ingredients/${ingredientId}`, "DELETE")).status, 200);
  assert.equal((await call(`/api/admin/regions/${regionId}`, "DELETE")).status, 200);
  assert.equal((await call(`/api/admin/ingredients/${ingredientId}`)).status, 404);
  assert.equal((await call(`/api/admin/regions/${regionId}`)).status, 404);
});
