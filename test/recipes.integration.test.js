const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const app = require("../server");
const pool = require("../src/config/database");
const jwt = require("jsonwebtoken");

let server, baseUrl, token, otherToken;
const users = [];
const recipes = [];
let ingredientIds, regionId, recipeId, easyRecipeId;
const prefix = `integration-${randomUUID()}`;

const request = async (path, method = "GET", auth = token) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: auth ? { Authorization: `Bearer ${auth}` } : {},
  });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  for (let index = 0; index < 2; index++) {
    const result = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [`${prefix}-${index}@example.com`, "integration-test-no-login"]);
    users.push(result.rows[0].id);
  }
  [token, otherToken] = users.map((userId) => jwt.sign(
    { userId, role: "USER" }, process.env.JWT_ACCESS_SECRET, { expiresIn: "5m" }));
  const regions = await pool.query("SELECT id FROM regions ORDER BY id LIMIT 1");
  regionId = regions.rows[0].id;
  const ingredients = await pool.query("SELECT id FROM ingredients ORDER BY id LIMIT 3");
  assert.equal(ingredients.rows.length, 3, "Cần chạy database/seed.sql trước");
  ingredientIds = ingredients.rows.map((item) => item.id);
  for (let index = 0; index < 2; index++) {
    const result = await pool.query(
      `INSERT INTO recipes (slug, name, region_id, source_url)
       VALUES ($1, $1, $2, 'https://example.com/guide') RETURNING id`,
      [`${prefix}-${index}`, regionId]);
    recipes.push(result.rows[0].id);
  }
  [recipeId, easyRecipeId] = recipes;
  for (const ingredientId of ingredientIds) {
    await pool.query("INSERT INTO recipe_ingredients VALUES ($1, $2, 2, 'kg')", [recipeId, ingredientId]);
  }
  await pool.query("INSERT INTO recipe_ingredients VALUES ($1, $2, 1, 'kg')", [easyRecipeId, ingredientIds[0]]);
  await pool.query(
    `INSERT INTO user_ingredients (user_id, ingredient_id, quantity, unit, expires_at)
     VALUES ($1, $2, 1, 'kg', CURRENT_DATE + 1),
            ($1, $2, 100, 'kg', CURRENT_DATE - 1),
            ($1, $3, 1, 'kg', CURRENT_DATE - 1),
            ($1, $4, 0, 'kg', NULL)`, [users[0], ...ingredientIds]);
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query("DELETE FROM recipes WHERE id = ANY($1::int[])", [recipes]);
  await pool.query("DELETE FROM users WHERE id = ANY($1::int[])", [users]);
  await pool.end();
});

test("Danh sách, chi tiết, so khớp, vùng miền và phân trang", async () => {
  assert.equal((await request("/api/recipes", "GET", null)).status, 401);
  const regions = await request("/api/regions");
  assert.equal(regions.status, 200);
  assert.ok(regions.body.regions.some((region) => region.id === regionId));
  const detail = await request(`/api/recipes/${recipeId}`);
  assert.equal(detail.status, 200);
  const recipe = detail.body.recipe;
  assert.equal(recipe.matchPercentage, 33);
  assert.equal(recipe.missingIngredientCount, 2);
  assert.equal(recipe.shouldCookSoon, true);
  const available = recipe.ingredients.find((item) => item.id === ingredientIds[0]);
  assert.equal(available.availableQuantity, 1, "Không cộng lô đã hết hạn");
  assert.equal(available.quantitySufficient, false);
  const list = await request(`/api/recipes?search=${prefix}&regionIds=${regionId}&limit=1`);
  assert.equal(list.body.recipes.length, 1);
  assert.equal(list.body.pagination.total, 2);
  assert.equal((await request(`/api/recipes?search=${prefix}&page=2&limit=1`)).body.recipes.length, 1);
  for (const path of ["/api/recipes/nope", "/api/recipes?regionIds=oops", "/api/recipes?limit=101", "/api/recipes?page=-1"]) {
    assert.equal((await request(path)).status, 400);
  }
  assert.equal((await request("/api/recipes/2147483647")).status, 404);
});

test("Gợi ý ưu tiên hạn dùng, khẩu vị và vùng mặc định", async () => {
  let response = await request(`/api/recipes/recommendations?search=${prefix}&regionIds=all`);
  assert.equal(response.status, 200);
  assert.equal(response.body.recipes[0].id, easyRecipeId);
  assert.equal(response.body.recipes[0].matchPercentage, 100);
  // Không hạn dùng vẫn được tính; hết hạn hôm nay thuộc nhóm nên nấu sớm.
  await pool.query(
    `UPDATE user_ingredients SET expires_at = NULL
     WHERE user_id = $1 AND ingredient_id = $2 AND quantity = 1`, [users[0], ingredientIds[0]]);
  const withoutExpiry = await request(`/api/recipes/${easyRecipeId}`);
  assert.equal(withoutExpiry.body.recipe.shouldCookSoon, false);
  await pool.query(
    `UPDATE user_ingredients SET expires_at = CURRENT_DATE
     WHERE user_id = $1 AND ingredient_id = $2 AND quantity = 1`, [users[0], ingredientIds[0]]);
  assert.equal((await request(`/api/recipes/${easyRecipeId}`)).body.recipe.shouldCookSoon, true);
  const anotherRegion = await pool.query("SELECT name FROM regions WHERE id <> $1 LIMIT 1", [regionId]);
  await pool.query("INSERT INTO user_preferences (user_id, default_region) VALUES ($1, $2)",
    [users[0], anotherRegion.rows[0].name]);
  assert.equal((await request(`/api/recipes/recommendations?search=${prefix}`)).body.recipes.length, 0);
  assert.equal((await request(`/api/recipes/recommendations?search=${prefix}&regionIds=all`)).body.recipes.length, 2);
  const ingredient = await pool.query("SELECT name FROM ingredients WHERE id = $1", [ingredientIds[0]]);
  for (const field of ["allergies", "excluded_ingredients"]) {
    await pool.query(`UPDATE user_preferences SET ${field} = $1::jsonb WHERE user_id = $2`,
      [JSON.stringify([ingredient.rows[0].name]), users[0]]);
    response = await request(`/api/recipes/recommendations?search=${prefix}&regionIds=all`);
    assert.equal(response.body.recipes.length, 0);
    await pool.query(`UPDATE user_preferences SET ${field} = '[]'::jsonb WHERE user_id = $1`, [users[0]]);
  }
  const category = await pool.query(
    `SELECT c.name FROM ingredients i JOIN ingredient_categories c ON c.id = i.category_id WHERE i.id = $1`,
    [ingredientIds[0]]);
  await pool.query("UPDATE user_preferences SET allergies = $1::jsonb WHERE user_id = $2",
    [JSON.stringify([category.rows[0].name]), users[0]]);
  assert.equal((await request(`/api/recipes/recommendations?search=${prefix}&regionIds=all`)).body.recipes.length, 0);
  await pool.query("UPDATE user_preferences SET allergies = '[]'::jsonb WHERE user_id = $1", [users[0]]);
  const priority = await pool.query(
    `INSERT INTO recipes (slug, name, region_id, source_url)
     VALUES ($1, $1, $2, 'https://example.com/guide') RETURNING id`, [`${prefix}-fresh`, regionId]);
  const freshRecipeId = priority.rows[0].id;
  recipes.push(freshRecipeId);
  await pool.query("INSERT INTO recipe_ingredients VALUES ($1, $2, 1, 'kg')", [freshRecipeId, ingredientIds[1]]);
  await pool.query(
    `INSERT INTO user_ingredients (user_id, ingredient_id, quantity, unit)
     VALUES ($1, $2, 1, 'kg')`, [users[0], ingredientIds[1]]);
  response = await request(`/api/recipes/recommendations?search=${prefix}&regionIds=all`);
  assert.deepEqual(response.body.recipes.map((recipe) => recipe.id), [easyRecipeId, recipeId, freshRecipeId]);
  assert.equal(response.body.recipes[2].matchPercentage, 100);
  assert.equal(response.body.recipes[2].shouldCookSoon, false);
});

test("Không suy đoán đơn vị và không lấy tủ lạnh của người khác", async () => {
  const empty = await request(`/api/recipes/${recipeId}`, "GET", otherToken);
  assert.equal(empty.body.recipe.matchPercentage, 0);
  await pool.query(
    `UPDATE user_ingredients SET unit = 'bó'
     WHERE user_id = $1 AND ingredient_id = $2 AND quantity = 1`, [users[0], ingredientIds[0]]);
  const detail = await request(`/api/recipes/${recipeId}`);
  const item = detail.body.recipe.ingredients.find((ingredient) => ingredient.id === ingredientIds[0]);
  assert.equal(item.available, true);
  assert.equal(item.quantitySufficient, null);
  assert.equal(item.availableQuantity, 0);
  await pool.query(
    `UPDATE user_ingredients SET unit = 'kg'
     WHERE user_id = $1 AND ingredient_id = $2 AND quantity = 1`, [users[0], ingredientIds[0]]);
});

test("Yêu thích không trùng, tách dữ liệu người dùng, bỏ yêu thích", async () => {
  assert.equal((await request(`/api/favorites/${recipeId}`, "POST")).status, 201);
  assert.equal((await request(`/api/favorites/${recipeId}`, "POST")).status, 200);
  assert.equal((await request("/api/favorites")).body.pagination.total, 1);
  assert.equal((await request(`/api/recipes/${recipeId}`)).body.recipe.isFavorite, true);
  assert.equal((await request("/api/favorites", "GET", otherToken)).body.pagination.total, 0);
  await request(`/api/favorites/${recipeId}`, "DELETE", otherToken);
  assert.equal((await request("/api/favorites")).body.pagination.total, 1);
  assert.equal((await request("/api/favorites/2147483647", "POST")).status, 404);
  assert.equal((await request("/api/favorites/abc", "POST")).status, 400);
  assert.equal((await request(`/api/favorites/${recipeId}`, "DELETE")).status, 200);
  assert.equal((await request("/api/favorites")).body.pagination.total, 0);
  assert.equal((await request(`/api/recipes/${recipeId}`)).body.recipe.isFavorite, false);
});
