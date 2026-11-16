const { pool, endpoint, fail, id, text, body, quantity, date, boolean, servings, transaction,
  lockUser, exists, recipe, getUnits, unitInfo, cents, paging, pagination } = require("../services/workflowService");

const columns = `s.id, s.ingredient_id AS "ingredientId", i.name, s.quantity::float8 AS quantity, s.unit,
  s.recipe_id AS "recipeId", (s.purchased_at IS NOT NULL) AS purchased, s.purchased_at AS "purchasedAt",
  s.moved_at AS "movedAt", s.fridge_item_id AS "fridgeItemId", s.created_at AS "createdAt", s.updated_at AS "updatedAt"`;
const getItem = async (client, userId, itemId) => {
  const result = await client.query(`SELECT ${columns} FROM shopping_items s JOIN ingredients i ON i.id = s.ingredient_id WHERE s.id = $1 AND s.user_id = $2`, [itemId, userId]);
  if (!result.rows.length) fail(404, "Không tìm thấy mục mua sắm");
  return result.rows[0];
};
const mutable = async (client, userId, itemId) => {
  const item = await getItem(client, userId, itemId);
  if (item.movedAt) fail(409, "Mục đã được chuyển vào tủ lạnh, không thể chỉnh sửa");
  return item;
};
const list = endpoint(async (req, res) => {
  const filters = paging(req.query);
  const status = req.query.status || "OPEN";
  const clauses = { OPEN: "s.moved_at IS NULL", PENDING: "s.purchased_at IS NULL AND s.moved_at IS NULL",
    PURCHASED: "s.purchased_at IS NOT NULL AND s.moved_at IS NULL", MOVED: "s.moved_at IS NOT NULL", ALL: "TRUE" };
  if (typeof status !== "string" || !Object.hasOwn(clauses, status)) fail(400, "status không hợp lệ");
  const params = [req.user.userId, `%${filters.search}%`];
  const where = `WHERE s.user_id = $1 AND i.name ILIKE $2 AND (${clauses[status]})`;
  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM shopping_items s JOIN ingredients i ON i.id = s.ingredient_id ${where}`, params);
  const result = await pool.query(`SELECT ${columns} FROM shopping_items s JOIN ingredients i ON i.id = s.ingredient_id ${where} ORDER BY s.id DESC LIMIT $3 OFFSET $4`, [...params, filters.limit, filters.offset]);
  res.json({ items: result.rows, pagination: pagination(count.rows[0].total, filters) });
});
const create = endpoint(async (req, res) => {
  const data = body(req.body);
  const ingredientId = id(data.ingredientId, "ingredientId");
  const amount = quantity(data.quantity);
  const unit = text(data.unit, "unit", 30);
  const item = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    await exists(client, "ingredients", ingredientId, "ingredientId");
    const result = await client.query("INSERT INTO shopping_items (user_id, ingredient_id, quantity, unit) VALUES ($1,$2,$3,$4) RETURNING id", [req.user.userId, ingredientId, amount, unit]);
    return getItem(client, req.user.userId, result.rows[0].id);
  });
  res.status(201).json({ item });
});
const update = endpoint(async (req, res) => {
  const itemId = id(req.params.id);
  const data = body(req.body);
  if (!["quantity", "unit", "purchased"].some((key) => Object.hasOwn(data, key))) fail(400, "Cần trường quantity, unit hoặc purchased");
  const amount = data.quantity === undefined ? null : quantity(data.quantity);
  const unit = data.unit === undefined ? null : text(data.unit, "unit", 30);
  const purchased = data.purchased === undefined ? null : boolean(data.purchased, "purchased");
  const item = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    await mutable(client, req.user.userId, itemId);
    await client.query(`UPDATE shopping_items SET quantity = COALESCE($1,quantity), unit = COALESCE($2,unit),
      purchased_at = CASE WHEN $3::boolean IS NULL THEN purchased_at WHEN $3 THEN COALESCE(purchased_at,NOW()) ELSE NULL END,
      updated_at = NOW() WHERE id = $4 AND user_id = $5`, [amount, unit, purchased, itemId, req.user.userId]);
    return getItem(client, req.user.userId, itemId);
  });
  res.json({ item });
});
const remove = endpoint(async (req, res) => {
  await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    const result = await client.query("DELETE FROM shopping_items WHERE id = $1 AND user_id = $2 RETURNING id", [id(req.params.id), req.user.userId]);
    if (!result.rows.length) fail(404, "Không tìm thấy mục mua sắm");
  });
  res.json({ message: "Đã xóa mục mua sắm" });
});
const fromRecipe = endpoint(async (req, res) => {
  const recipeId = id(req.params.recipeId, "recipeId");
  const data = req.body === undefined ? {} : body(req.body);
  const multiplier = servings(data.servings);
  const result = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    const dish = await recipe(client, recipeId);
    const units = await getUnits(client);
    const stock = (await client.query(`SELECT ingredient_id, quantity, unit FROM user_ingredients
      WHERE user_id = $1 AND quantity > 0 AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)`, [req.user.userId])).rows;
    const shopping = (await client.query("SELECT ingredient_id, quantity, unit FROM shopping_items WHERE user_id = $1 AND moved_at IS NULL", [req.user.userId])).rows;
    const items = [], warnings = [];
    for (const ingredient of dish.ingredients) {
      const info = unitInfo(ingredient.unit, units);
      let available = 0;
      for (const item of [...stock, ...shopping].filter((item) => item.ingredient_id === ingredient.ingredientId)) {
        const other = unitInfo(item.unit, units);
        if (other.group === info.group) available += cents(item.quantity) * other.factor;
        else warnings.push({ ingredientId: ingredient.ingredientId, unit: item.unit, message: "Đơn vị không quy đổi được nên không trừ vào lượng cần mua" });
      }
      const missing = Math.max(0, cents(ingredient.quantity) * multiplier * info.factor - available);
      if (!missing) continue;
      // Làm tròn lên theo 0.01 đơn vị mua để không mua thiếu; không làm tròn khi trừ tủ.
      const amount = quantity(Math.ceil(missing / info.factor) / 100);
      const inserted = await client.query(`INSERT INTO shopping_items (user_id, ingredient_id, quantity, unit, recipe_id)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user.userId, ingredient.ingredientId, amount, info.code, recipeId]);
      items.push(await getItem(client, req.user.userId, inserted.rows[0].id));
    }
    return { items, warnings };
  });
  res.status(result.items.length ? 201 : 200).json(result);
});
const move = endpoint(async (req, res) => {
  const itemId = id(req.params.id);
  const data = req.body === undefined ? {} : body(req.body);
  const expiresAt = data.expiresAt === undefined ? null : date(data.expiresAt);
  const amount = data.quantity === undefined ? undefined : quantity(data.quantity);
  const result = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    const item = await getItem(client, req.user.userId, itemId);
    if (item.movedAt) return { item, alreadyMoved: true };
    const inserted = await client.query(`INSERT INTO user_ingredients (user_id, ingredient_id, quantity, unit, expires_at)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.user.userId, item.ingredientId, amount ?? item.quantity, item.unit, expiresAt]);
    await client.query(`UPDATE shopping_items SET quantity = $1, fridge_item_id = $2, moved_at = NOW(),
      purchased_at = COALESCE(purchased_at,NOW()), updated_at = NOW() WHERE id = $3 AND user_id = $4`,
    [amount ?? item.quantity, inserted.rows[0].id, itemId, req.user.userId]);
    return { item: await getItem(client, req.user.userId, itemId), alreadyMoved: false };
  });
  res.json(result);
});

module.exports = { list, create, update, remove, fromRecipe, move };
