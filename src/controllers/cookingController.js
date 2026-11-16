const { createHash } = require("node:crypto");
const { pool, endpoint, fail, id, text, body, quantity, servings, transaction, lockUser,
  recipe, getUnits, unitInfo, cents, paging, pagination } = require("../services/workflowService");

const columns = 'id, recipe_id AS "recipeId", recipe_name AS "recipeName", servings, note, created_at AS "createdAt"';
const detail = async (client, userId, sessionId) => {
  const session = (await client.query(`SELECT ${columns} FROM cooking_sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId])).rows[0];
  if (!session) fail(404, "Không tìm thấy lịch sử nấu");
  session.consumptions = (await client.query(`SELECT fridge_item_id AS "fridgeItemId", ingredient_id AS "ingredientId",
    ingredient_name AS "ingredientName", quantity::float8 AS quantity, unit
    FROM cooking_consumptions WHERE session_id = $1 ORDER BY id`, [sessionId])).rows;
  return session;
};
const list = endpoint(async (req, res) => {
  const filters = paging(req.query);
  const params = [req.user.userId, `%${filters.search}%`];
  const where = "WHERE user_id = $1 AND recipe_name ILIKE $2";
  const count = (await pool.query(`SELECT COUNT(*)::int AS total FROM cooking_sessions ${where}`, params)).rows[0].total;
  const sessions = (await pool.query(`SELECT ${columns} FROM cooking_sessions ${where} ORDER BY id DESC LIMIT $3 OFFSET $4`, [...params, filters.limit, filters.offset])).rows;
  res.json({ sessions, pagination: pagination(count, filters) });
});
const get = endpoint(async (req, res) => res.json({ session: await detail(pool, req.user.userId, id(req.params.id)) }));
const create = endpoint(async (req, res) => {
  const data = body(req.body);
  const recipeId = id(data.recipeId, "recipeId");
  const multiplier = servings(data.servings);
  const note = data.note == null ? null : text(data.note, "note", 1000);
  const requestKey = req.get("Idempotency-Key");
  if (!requestKey || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestKey)) fail(400, "Cần header Idempotency-Key là UUID; dùng lại cùng key khi gửi lại request");
  let manual = null;
  if (data.consumptions !== undefined) {
    if (!Array.isArray(data.consumptions) || !data.consumptions.length || data.consumptions.length > 500) fail(400, "consumptions cần 1–500 lô");
    manual = data.consumptions.map((entry) => {
      body(entry);
      return { fridgeItemId: id(entry.fridgeItemId, "fridgeItemId"), quantity: quantity(entry.quantity) };
    }).sort((a, b) => a.fridgeItemId - b.fridgeItemId);
    if (new Set(manual.map((entry) => entry.fridgeItemId)).size !== manual.length) fail(400, "Không lặp fridgeItemId");
  }
  const hash = createHash("sha256").update(JSON.stringify({ recipeId, servings: multiplier, note, consumptions: manual })).digest("hex");
  const result = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    const previous = (await client.query("SELECT id, request_hash FROM cooking_sessions WHERE user_id = $1 AND request_key = $2", [req.user.userId, requestKey])).rows[0];
    if (previous) {
      if (previous.request_hash !== hash) fail(409, "Idempotency-Key đã dùng cho nội dung khác");
      return { session: await detail(client, req.user.userId, previous.id), replayed: true };
    }
    const dish = await recipe(client, recipeId);
    const units = await getUnits(client);
    // Khóa theo ID trước; FEFO thực hiện sau để thứ tự khóa luôn nhất quán.
    const stock = (await client.query(`SELECT ui.id, ui.ingredient_id AS "ingredientId", i.name,
      ui.quantity::float8 AS quantity, ui.unit, ui.expires_at::text AS "expiresAt",
      (ui.expires_at IS NULL OR ui.expires_at >= CURRENT_DATE) AS usable
      FROM user_ingredients ui JOIN ingredients i ON i.id = ui.ingredient_id
      WHERE ui.user_id = $1 AND ui.ingredient_id = ANY($2::int[]) ORDER BY ui.id FOR UPDATE OF ui`,
    [req.user.userId, dish.ingredients.map((item) => item.ingredientId)])).rows;
    const consumed = [];
    if (manual) {
      for (const entry of manual) {
        const batch = stock.find((item) => item.id === entry.fridgeItemId);
        if (!batch) fail(404, "Không tìm thấy lô của bạn thuộc nguyên liệu công thức");
        if (!batch.usable || cents(batch.quantity) < cents(entry.quantity)) fail(409, "Lô đã hết hạn hoặc không đủ số lượng");
        consumed.push({ ...batch, used: entry.quantity });
      }
    } else {
      const ordered = [...stock].sort((a, b) => (a.expiresAt || "9999-12-31").localeCompare(b.expiresAt || "9999-12-31") || a.id - b.id);
      for (const ingredient of dish.ingredients) {
        const info = unitInfo(ingredient.unit, units);
        let remaining = cents(ingredient.quantity) * multiplier * info.factor;
        for (const batch of ordered.filter((item) => item.ingredientId === ingredient.ingredientId && item.usable && item.quantity > 0)) {
          const other = unitInfo(batch.unit, units);
          if (other.group !== info.group) continue;
          const usedCents = Math.min(cents(batch.quantity), Math.floor(remaining / other.factor));
          if (!usedCents) continue;
          consumed.push({ ...batch, used: usedCents / 100 });
          remaining -= usedCents * other.factor;
          if (!remaining) break;
        }
        if (remaining) fail(409, `Không đủ ${ingredient.name} hoặc không thể trừ chính xác theo đơn vị hiện có; hãy kiểm tra tủ/chọn lượng thực tế`);
      }
    }
    const sessionId = (await client.query(`INSERT INTO cooking_sessions (user_id,recipe_id,recipe_name,servings,note,request_key,request_hash)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [req.user.userId, recipeId, dish.name, multiplier, note, requestKey, hash])).rows[0].id;
    for (const item of consumed) {
      const updated = await client.query(`UPDATE user_ingredients SET quantity = quantity - $1, updated_at = NOW()
        WHERE id = $2 AND user_id = $3 AND quantity >= $1 RETURNING id`, [item.used, item.id, req.user.userId]);
      if (!updated.rows.length) fail(409, "Số lượng tủ lạnh đã thay đổi");
      await client.query(`INSERT INTO cooking_consumptions (session_id,fridge_item_id,ingredient_id,ingredient_name,quantity,unit)
        VALUES ($1,$2,$3,$4,$5,$6)`, [sessionId, item.id, item.ingredientId, item.name, item.used, item.unit]);
    }
    return { session: await detail(client, req.user.userId, sessionId), replayed: false };
  });
  res.status(result.replayed ? 200 : 201).json(result);
});

module.exports = { list, get, create };
