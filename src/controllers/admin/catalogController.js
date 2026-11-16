const pool = require("../../config/database");
const { fail, id, text, url, body, paging, pagination, transaction, endpoint, exists } = require("../../services/adminService");

// Các tên bảng/cột đều là hằng số phía server.
const configs = {
  regions: {
    table: "regions", key: "region", select: "id, name", fields: { name: "name" },
    validate: async (data) => ({ name: text(data.name, "name", 50) }),
  },
  ingredients: {
    table: "ingredients", key: "ingredient",
    select: 'id, name, category_id AS "categoryId", default_unit AS "defaultUnit", created_at AS "createdAt"',
    fields: { name: "name", categoryId: "category_id", defaultUnit: "default_unit" },
    validate: async (data, client) => {
      const categoryId = data.categoryId == null ? null : id(data.categoryId, "categoryId");
      if (categoryId !== null) await exists(client, "ingredient_categories", categoryId, "categoryId");
      return { name: text(data.name, "name", 150), categoryId,
        defaultUnit: data.defaultUnit == null ? null : text(data.defaultUnit, "defaultUnit", 30) };
    },
  },
  recipes: {
    table: "recipes", key: "recipe",
    select: 'id, slug, name, region_id AS "regionId", image_url AS "imageUrl", source_url AS "sourceUrl", created_at AS "createdAt", updated_at AS "updatedAt"',
    fields: { slug: "slug", name: "name", regionId: "region_id", imageUrl: "image_url", sourceUrl: "source_url" },
    validate: async (data, client) => {
      const name = text(data.name, "name", 200);
      const slug = text(data.slug, "slug", 150);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(400, "slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang");
      const regionId = id(data.regionId, "regionId");
      await exists(client, "regions", regionId, "regionId");
      if (!Array.isArray(data.ingredients) || !data.ingredients.length || data.ingredients.length > 200) {
        fail(400, "ingredients cần từ 1 đến 200 nguyên liệu");
      }
      const seen = new Set();
      const ingredients = [];
      for (const item of data.ingredients) {
        body(item);
        const ingredientId = id(item.ingredientId, "ingredientId");
        if (seen.has(ingredientId)) fail(400, "Không lặp ingredientId trong một công thức");
        seen.add(ingredientId);
        if (typeof item.quantity !== "number" || !Number.isFinite(item.quantity)
          || item.quantity <= 0 || item.quantity > 99999999.99
          || Number(item.quantity.toFixed(2)) !== item.quantity) {
          fail(400, "quantity phải lớn hơn 0, tối đa 99999999.99 và tối đa 2 chữ số thập phân");
        }
        ingredients.push({ ingredientId, quantity: item.quantity, unit: text(item.unit, "unit", 30) });
      }
      const found = await client.query("SELECT id FROM ingredients WHERE id = ANY($1::int[]) FOR KEY SHARE", [[...seen]]);
      if (found.rows.length !== seen.size) fail(400, "Có ingredientId không tồn tại");
      return { slug, name, regionId, imageUrl: data.imageUrl == null ? null : url(data.imageUrl, "imageUrl"),
        sourceUrl: url(data.sourceUrl, "sourceUrl"), ingredients };
    },
  },
};

const detail = async (client, config, recordId, lock = false) => {
  const result = await client.query(`SELECT ${config.select} FROM ${config.table} WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [recordId]);
  if (!result.rows.length) fail(404, "Không tìm thấy bản ghi");
  const item = result.rows[0];
  if (config.table === "recipes") {
    const ingredients = await client.query(
      `SELECT ri.ingredient_id AS "ingredientId", i.name, ri.quantity::float8 AS quantity, ri.unit
       FROM recipe_ingredients ri JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.recipe_id = $1 ORDER BY ri.ingredient_id`, [recordId]);
    item.ingredients = ingredients.rows;
  }
  return item;
};

const catalogController = (resource) => {
  const config = configs[resource];
  return {
    list: endpoint(async (req, res) => {
      const filters = paging(req.query);
      const params = [`%${filters.search}%`];
      let where = "WHERE name ILIKE $1";
      const filterKey = resource === "recipes" ? "regionId" : resource === "ingredients" ? "categoryId" : null;
      if (filterKey && req.query[filterKey] !== undefined) {
        params.push(id(req.query[filterKey], filterKey));
        where += ` AND ${config.fields[filterKey]} = $${params.length}`;
      }
      const count = await pool.query(`SELECT COUNT(*)::int AS total FROM ${config.table} ${where}`, params);
      const result = await pool.query(
        `SELECT ${config.select} FROM ${config.table} ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, filters.limit, filters.offset]);
      res.json({ [resource]: result.rows, pagination: pagination(count.rows[0].total, filters) });
    }),
    get: endpoint(async (req, res) => res.json({ [config.key]: await detail(pool, config, id(req.params.id)) })),
    create: endpoint(async (req, res) => {
      const data = body(req.body);
      const record = await transaction(async (client) => {
        const validated = await config.validate(data, client);
        const keys = Object.keys(config.fields);
        const result = await client.query(
          `INSERT INTO ${config.table} (${keys.map((key) => config.fields[key]).join(", ")})
           VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING id`, keys.map((key) => validated[key]));
        const recordId = result.rows[0].id;
        if (resource === "recipes") await saveIngredients(client, recordId, validated.ingredients);
        return detail(client, config, recordId);
      });
      res.status(201).json({ [config.key]: record });
    }),
    update: endpoint(async (req, res) => {
      const recordId = id(req.params.id);
      const data = body(req.body);
      const allowed = [...Object.keys(config.fields), ...(resource === "recipes" ? ["ingredients"] : [])];
      if (!allowed.some((key) => Object.hasOwn(data, key))) fail(400, "Cần ít nhất một trường hợp lệ để cập nhật");
      const record = await transaction(async (client) => {
        const previous = await detail(client, config, recordId, true);
        const updates = Object.fromEntries(allowed.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]]));
        const validated = await config.validate({ ...previous, ...updates }, client);
        const keys = Object.keys(config.fields);
        await client.query(
          `UPDATE ${config.table} SET ${keys.map((key, index) => `${config.fields[key]} = $${index + 1}`).join(", ")}
           ${resource === "recipes" ? ", updated_at = NOW()" : ""} WHERE id = $${keys.length + 1}`,
          [...keys.map((key) => validated[key]), recordId]);
        if (resource === "recipes" && Object.hasOwn(data, "ingredients")) {
          await client.query("DELETE FROM recipe_ingredients WHERE recipe_id = $1", [recordId]);
          await saveIngredients(client, recordId, validated.ingredients);
        }
        return detail(client, config, recordId);
      });
      res.json({ [config.key]: record });
    }),
    delete: endpoint(async (req, res) => {
      const result = await pool.query(`DELETE FROM ${config.table} WHERE id = $1 RETURNING id`, [id(req.params.id)]);
      if (!result.rows.length) fail(404, "Không tìm thấy bản ghi");
      res.json({ message: "Đã xóa", id: result.rows[0].id });
    }),
  };
};

async function saveIngredients(client, recipeId, ingredients) {
  await client.query(
    `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
     SELECT $1, * FROM UNNEST($2::int[], $3::numeric[], $4::text[])`,
    [recipeId, ingredients.map((item) => item.ingredientId), ingredients.map((item) => item.quantity), ingredients.map((item) => item.unit)]);
}

module.exports = catalogController;
