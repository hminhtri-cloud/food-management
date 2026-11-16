const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const app = require("../server");
const pool = require("../src/config/database");
const { runReminderCycle } = require("../src/services/reminderService");

const prefix = `flow-${randomUUID()}`;
const users = [], ingredients = [], recipes = [];
let server, base, tokens, categoryId, regionId, recipeId, today;
const call = async (path, method = "GET", data, token = tokens[0], headers = {}) => {
  const response = await fetch(`${base}/api${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() };
};
const cook = (data, key = randomUUID(), token = tokens[0]) => call("/cooking-sessions", "POST", data, token, { "Idempotency-Key": key });
const stock = async (rows, userId = users[0]) => {
  await pool.query("DELETE FROM user_ingredients WHERE user_id=$1", [userId]);
  const result = [];
  for (const [index, quantity, unit, days] of rows) {
    result.push((await pool.query(`INSERT INTO user_ingredients (user_id,ingredient_id,quantity,unit,expires_at)
      VALUES ($1,$2,$3,$4,CASE WHEN $5::int IS NULL THEN NULL ELSE CURRENT_DATE+$5::int END) RETURNING id`,
    [userId, ingredients[index], quantity, unit, days])).rows[0].id);
  }
  return result;
};
before(async () => {
  for (const role of ["USER", "USER", "ADMIN"]) {
    users.push((await pool.query("INSERT INTO users (email,password_hash,role) VALUES ($1,'test-no-login',$2) RETURNING id", [`${prefix}-${users.length}@example.com`, role])).rows[0].id);
  }
  tokens = users.map((userId) => jwt.sign({ userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: "10m" }));
  today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
  categoryId = (await pool.query("INSERT INTO ingredient_categories(name) VALUES ($1) RETURNING id", [prefix])).rows[0].id;
  regionId = (await pool.query("INSERT INTO regions(name) VALUES ($1) RETURNING id", [prefix])).rows[0].id;
  for (let index = 0; index < 2; index++) {
    ingredients.push((await pool.query("INSERT INTO ingredients(name,category_id) VALUES ($1,$2) RETURNING id", [`${prefix}-${index}`, categoryId])).rows[0].id);
  }
  recipeId = (await pool.query("INSERT INTO recipes(slug,name,region_id,source_url) VALUES ($1,$1,$2,'https://example.com/recipe') RETURNING id", [prefix, regionId])).rows[0].id;
  recipes.push(recipeId);
  await pool.query("INSERT INTO recipe_ingredients VALUES ($1,$2,500,'g'),($1,$3,200,'ml')", [recipeId, ...ingredients]);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [users]);
    await pool.query("DELETE FROM recipes WHERE id=ANY($1::int[])", [recipes]);
    await pool.query("DELETE FROM ingredients WHERE id=ANY($1::int[])", [ingredients]);
    if (regionId) await pool.query("DELETE FROM regions WHERE id=$1", [regionId]);
    if (categoryId) await pool.query("DELETE FROM ingredient_categories WHERE id=$1", [categoryId]);
  } finally { await pool.end(); }
});

test("16 endpoint mới đều cần USER, tách quyền ADMIN và có Swagger", async () => {
  const endpoints = [
    ["/fridge/summary", "GET"], ["/ingredient-categories", "GET"], ["/units", "GET"], ["/shopping-list", "GET"],
    ["/shopping-list/items", "POST"], ["/shopping-list/items/1", "PATCH"], ["/shopping-list/items/1", "DELETE"],
    ["/shopping-list/from-recipe/1", "POST"], ["/shopping-list/items/1/move-to-fridge", "POST"],
    ["/cooking-sessions", "POST"], ["/cooking-sessions", "GET"], ["/cooking-sessions/1", "GET"],
    ["/devices", "POST"], ["/devices/1", "DELETE"], ["/settings/notifications", "GET"], ["/settings/notifications", "PUT"],
  ];
  assert.equal(endpoints.length, 16);
  const spec = require("../src/config/swagger");
  for (const [path, method] of endpoints) {
    const data = ["POST", "PATCH", "PUT"].includes(method) ? {} : undefined;
    assert.equal((await call(path, method, data, null)).status, 401, `${method} ${path}`);
    assert.equal((await call(path, method, data, tokens[2])).status, 403, `${method} ${path}`);
    const documented = `/api${path.replace(/\/1(?=\/|$)/g, path.includes("from-recipe") ? "/{recipeId}" : "/{id}")}`;
    assert.ok(spec.paths[documented]?.[method.toLowerCase()]?.security);
  }
});

test("Tủ lạnh summary, lọc nhóm/trạng thái, hết hạn hôm nay, không tính lô 0", async () => {
  await stock([[0, 1, "g", 0], [0, 1, "g", 3], [0, 1, "g", -1], [1, 1, "ml", 4], [1, 1, "ml", null], [0, 0, "g", -1]]);
  await stock([[0, 10, "g", 1]], users[1]);
  const summary = await call("/fridge/summary");
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.body, { totalItems: 5, freshItems: 1, expiringSoonItems: 2, expiredItems: 1, noExpiryItems: 1 });
  const list = await call(`/fridge?categoryId=${categoryId}&expiryStatus=EXPIRING_SOON`);
  assert.equal(list.body.ingredients.length, 2);
  assert.ok(list.body.ingredients.every((item) => item.category_id === categoryId));
  assert.equal((await call("/fridge?expiryStatus=EXPIRED")).body.ingredients.length, 1);
  assert.equal((await call("/fridge?categoryId=2147483647")).body.ingredients.length, 0);
  assert.equal((await call("/fridge?expiryStatus=oops")).status, 400);
  assert.equal((await call("/fridge?categoryId=nope")).status, 400);
  assert.ok((await call("/ingredient-categories")).body.categories.some((item) => item.id === categoryId));
  const units = (await call("/units")).body.units;
  assert.equal(units.find((item) => item.code === "kg").baseFactor, 1000);
  assert.notEqual(units.find((item) => item.code === "quả").conversionGroup, units.find((item) => item.code === "cái").conversionGroup);
  const created = await call("/fridge", "POST", { ingredientId: ingredients[0], quantity: 1, unit: "g", expiresAt: today });
  assert.equal(created.status, 201);
  const cleared = await call(`/fridge/${created.body.ingredient.id}`, "PUT", { expiresAt: null });
  assert.equal(cleared.body.ingredient.expires_at, null);
  assert.equal((await call("/fridge", "POST", { ingredientId: ingredients[0], quantity: -1, unit: "g" })).status, 400);
});

test("Mua sắm: thiếu định lượng có quy đổi, gọi đồng thời không thêm lặp nhu cầu", async () => {
  await pool.query("DELETE FROM shopping_items WHERE user_id=ANY($1::int[])", [users]);
  await stock([[0, 0.2, "kg", 1], [1, 0.05, "l", null], [0, 999, "g", -1]]);
  const results = await Promise.all([
    call(`/shopping-list/from-recipe/${recipeId}`, "POST", {}), call(`/shopping-list/from-recipe/${recipeId}`, "POST", {}),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  const items = (await call("/shopping-list")).body.items;
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.ingredientId === ingredients[0]).quantity, 300);
  assert.equal(items.find((item) => item.ingredientId === ingredients[1]).quantity, 150);
  const own = items[0];
  assert.equal((await call(`/shopping-list/items/${own.id}`, "PATCH", { purchased: true }, tokens[1])).status, 404);
  assert.equal((await call(`/shopping-list/items/${own.id}`, "DELETE", undefined, tokens[1])).status, 404);
  assert.equal((await call("/shopping-list", "GET", undefined, tokens[1])).body.items.length, 0);
  assert.equal((await call(`/shopping-list/items/${own.id}`, "PATCH", { purchased: true })).body.item.purchased, true);
  assert.equal((await call("/shopping-list?status=PURCHASED")).body.items.length, 1);
  assert.equal((await call(`/shopping-list/from-recipe/${recipeId}`, "POST", {})).body.items.length, 0, "Đã mua nhưng chưa vào tủ vẫn được tính");
  assert.equal((await call("/shopping-list?status=bad")).status, 400);
  assert.equal((await call("/shopping-list/items", "POST", { ingredientId: ingredients[0], quantity: 1e-9, unit: "g" })).status, 400);
  assert.equal((await call(`/shopping-list/from-recipe/${recipeId}`, "POST", { servings: 0 })).status, 400);
  assert.equal((await call("/shopping-list/from-recipe/2147483647", "POST", {})).status, 404);
});

test("Chuyển đồ mua vào tủ: atomic, chống chuyển hai lần, không tạo lại lô đã xóa", async () => {
  const created = await call("/shopping-list/items", "POST", { ingredientId: ingredients[0], quantity: 10, unit: "g" });
  assert.equal(created.status, 201);
  const itemId = created.body.item.id;
  assert.equal((await call(`/shopping-list/items/${itemId}/move-to-fridge`, "POST", {}, tokens[1])).status, 404);
  assert.equal((await call(`/shopping-list/items/${itemId}/move-to-fridge`, "POST", { expiresAt: "2026-02-30" })).status, 400);
  const moved = await Promise.all([0, 1].map(() => call(`/shopping-list/items/${itemId}/move-to-fridge`, "POST", { quantity: 12, expiresAt: today })));
  assert.ok(moved.every((result) => result.status === 200));
  assert.deepEqual(moved.map((result) => result.body.alreadyMoved).sort(), [false, true]);
  const fridgeId = moved[0].body.item.fridgeItemId;
  assert.equal(fridgeId, moved[1].body.item.fridgeItemId);
  const batch = (await pool.query("SELECT quantity::float8 AS quantity FROM user_ingredients WHERE id=$1", [fridgeId])).rows[0];
  assert.equal(batch.quantity, 12);
  assert.equal((await call(`/shopping-list/items/${itemId}`, "PATCH", { quantity: 1 })).status, 409);
  await call(`/fridge/${fridgeId}`, "DELETE");
  const retry = await call(`/shopping-list/items/${itemId}/move-to-fridge`, "POST", {});
  assert.equal(retry.body.alreadyMoved, true);
  assert.equal(retry.body.item.fridgeItemId, null);
  assert.equal((await call(`/shopping-list/items/${itemId}`, "DELETE")).status, 200);
});

test("Nấu tự động FEFO, đổi g/kg và ml/l, retry đồng thời chỉ trừ một lần", async () => {
  const batches = await stock([[0, 999, "g", -1], [0, 300, "g", 0], [0, 0.3, "kg", 5], [1, 0.2, "l", null]]);
  const key = randomUUID();
  const results = await Promise.all([cook({ recipeId }, key), cook({ recipeId }, key)]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 201]);
  assert.equal(results[0].body.session.id, results[1].body.session.id);
  const session = results[0].body.session;
  assert.deepEqual(session.consumptions.map((item) => [item.fridgeItemId, item.quantity]), [[batches[1], 300], [batches[2], 0.2], [batches[3], 0.2]]);
  const left = (await pool.query("SELECT quantity::float8 AS quantity FROM user_ingredients WHERE id=$1", [batches[2]])).rows[0].quantity;
  assert.equal(left, 0.1);
  assert.equal((await cook({ recipeId, servings: 2 }, key)).status, 409);
  assert.equal((await cook({ recipeId })).status, 409, "Không đủ thì không tạo lịch sử/trừ thêm");
  assert.equal((await pool.query("SELECT quantity::float8 AS quantity FROM user_ingredients WHERE id=$1", [batches[2]])).rows[0].quantity, 0.1);
  assert.equal((await call(`/cooking-sessions/${session.id}`, "GET", undefined, tokens[1])).status, 404);
  assert.equal((await call(`/cooking-sessions?search=${prefix}`, "GET", undefined, tokens[1])).body.sessions.length, 0);
  assert.ok((await call(`/cooking-sessions?search=${prefix}&limit=1`)).body.pagination.total >= 1);
  assert.equal((await call("/cooking-sessions", "POST", { recipeId })).status, 400);
});

test("Hai lần nấu khác key tranh cùng tồn kho: chỉ một lần thành công, không âm", async () => {
  await stock([[0, 500, "g", 1], [1, 200, "ml", null]]);
  const results = await Promise.all([cook({ recipeId }), cook({ recipeId })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const rows = (await pool.query("SELECT quantity::float8 AS quantity FROM user_ingredients WHERE user_id=$1", [users[0]])).rows;
  assert.ok(rows.every((item) => item.quantity === 0));
});

test("Nấu thủ công kiểm tra chủ lô, hạn dùng, số lượng và giữ snapshot lịch sử", async () => {
  const extraRecipe = (await pool.query("INSERT INTO recipes(slug,name,region_id,source_url) VALUES ($1,$1,$2,'https://example.com') RETURNING id", [`${prefix}-small`, regionId])).rows[0].id;
  recipes.push(extraRecipe);
  await pool.query("INSERT INTO recipe_ingredients VALUES ($1,$2,1,'g')", [extraRecipe, ingredients[0]]);
  const batches = await stock([[0, 0.01, "kg", null], [0, 10, "g", -1]]);
  const foreign = await stock([[0, 10, "g", null]], users[1]);
  assert.equal((await cook({ recipeId: extraRecipe })).status, 409, "Không tự làm tròn 1g thành 0.01kg");
  for (const [batchId, quantity, status] of [[foreign[0], 1, 404], [batches[1], 1, 409], [batches[0], 1, 409]]) {
    assert.equal((await cook({ recipeId: extraRecipe, consumptions: [{ fridgeItemId: batchId, quantity }] })).status, status);
  }
  const actual = await cook({ recipeId: extraRecipe, note: "Lượng thực tế", consumptions: [{ fridgeItemId: batches[0], quantity: 0.01 }] });
  assert.equal(actual.status, 201);
  await call(`/fridge/${batches[0]}`, "DELETE");
  await pool.query("DELETE FROM recipes WHERE id=$1", [extraRecipe]);
  const history = (await call(`/cooking-sessions/${actual.body.session.id}`)).body.session;
  assert.equal(history.recipeId, null);
  assert.equal(history.recipeName, `${prefix}-small`);
  assert.equal(history.consumptions[0].fridgeItemId, batches[0]);
  assert.equal(history.consumptions[0].quantity, 0.01);
});

test("Thiết bị và cài đặt: validation, token không trùng, đổi chủ và tách user", async () => {
  assert.equal((await call("/settings/notifications")).body.settings.enabled, false);
  for (const data of [{ enabled: "true" }, { reminderTime: "25:00" }, { daysBefore: 31 }, { timezone: "not-a-timezone" }, {}]) {
    assert.equal((await call("/settings/notifications", "PUT", data)).status, 400);
  }
  const updated = await call("/settings/notifications", "PUT", { enabled: true, reminderTime: "08:30", timezone: "Asia/Ho_Chi_Minh", daysBefore: 2 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.settings.reminderTime, "08:30");
  assert.equal((await call("/settings/notifications", "GET", undefined, tokens[1])).body.settings.enabled, false);
  assert.equal((await call("/devices", "POST", { fcmToken: "short" })).status, 400);
  const data = { fcmToken: `${prefix}:token-for-device`, platform: "ANDROID" };
  const device = (await call("/devices", "POST", data)).body.device;
  assert.equal((await call("/devices", "POST", data)).body.device.id, device.id);
  assert.equal((await call("/devices", "POST", data, tokens[1])).body.device.id, device.id);
  assert.equal((await call(`/devices/${device.id}`, "DELETE")).status, 404);
  assert.equal((await call(`/devices/${device.id}`, "DELETE", undefined, tokens[1])).status, 200);
  assert.equal((await call(`/devices/${device.id}`, "DELETE", undefined, tokens[1])).status, 404);
});

test("Worker FCM: giờ địa phương, chống gửi song song, retry chỉ thiết bị lỗi", async () => {
  await pool.query("DELETE FROM expiry_reminders WHERE user_id=$1", [users[0]]);
  await pool.query("DELETE FROM user_devices WHERE user_id=$1", [users[0]]);
  await call("/settings/notifications", "PUT", { enabled: true, reminderTime: "09:00", timezone: "Asia/Ho_Chi_Minh", daysBefore: 3 });
  await stock([]);
  await pool.query(`INSERT INTO user_ingredients(user_id,ingredient_id,quantity,unit,expires_at)
    VALUES ($1,$2,1,'g','2030-01-02'),($1,$2,999,'g','2030-01-01'),($1,$2,0,'g','2030-01-03')`, [users[0], ingredients[0]]);
  const fcmTokens = ["success", "temporary", "invalid"].map((value) => `${prefix}:${value}-device-token`);
  for (const fcmToken of fcmTokens) await call("/devices", "POST", { fcmToken });
  const sent = [];
  const sender = async (message) => {
    sent.push(message);
    return { responses: message.tokens.map((token) => token === fcmTokens[0] ? { success: true }
      : { success: false, error: { code: token === fcmTokens[1] ? "messaging/internal-error" : "messaging/registration-token-not-registered" } }) };
  };
  const before = await runReminderCycle({ sendMulticast: sender, now: new Date("2030-01-02T01:59:00Z"), userId: users[0] });
  assert.equal(before.claimed, 0);
  const options = { sendMulticast: sender, now: new Date("2030-01-02T02:00:00Z"), userId: users[0] };
  const first = await Promise.all([runReminderCycle(options), runReminderCycle(options)]);
  assert.equal(first.reduce((total, item) => total + item.claimed, 0), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].data.expiringCount, "1");
  assert.equal((await runReminderCycle({ ...options, now: new Date("2030-01-02T02:04:00Z") })).claimed, 0);
  const retry = [];
  const result = await runReminderCycle({ userId: users[0], now: new Date("2030-01-02T02:06:00Z"), sendMulticast: async (message) => {
    retry.push(...message.tokens); return { responses: message.tokens.map(() => ({ success: true })) };
  } });
  assert.equal(result.sent, 1);
  assert.deepEqual(retry, [fcmTokens[1]]);
  assert.equal((await pool.query("SELECT enabled FROM user_devices WHERE fcm_token=$1", [fcmTokens[2]])).rows[0].enabled, false);
  assert.equal((await runReminderCycle({ ...options, now: new Date("2030-01-02T03:00:00Z") })).claimed, 0);
});

test("Worker bỏ user tắt/khóa, đánh dấu ngày không có đồ sắp hết hạn", async () => {
  await call("/settings/notifications", "PUT", { enabled: false });
  const sender = async () => { throw new Error("Không được gửi"); };
  const options = { userId: users[0], now: new Date("2030-01-03T03:00:00Z"), sendMulticast: sender };
  assert.equal((await runReminderCycle(options)).claimed, 0);
  await call("/settings/notifications", "PUT", { enabled: true });
  await pool.query("UPDATE users SET status='LOCKED' WHERE id=$1", [users[0]]);
  assert.equal((await runReminderCycle(options)).claimed, 0);
  await pool.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [users[0]]);
  await stock([]);
  assert.equal((await runReminderCycle(options)).noItems, 1);
  assert.equal((await runReminderCycle(options)).claimed, 0);
});
