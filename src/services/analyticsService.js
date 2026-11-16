const pool = require("../config/database");

const recordRecipeEvents = async (userId, recipeIds, eventType) => {
  if (!recipeIds.length) return;
  await pool.query(
    `INSERT INTO recipe_events (user_id, recipe_id, event_type)
     SELECT $1, id, $3 FROM recipes WHERE id = ANY($2::int[])`,
    [userId, [...new Set(recipeIds)], eventType]);
};

// Gọi sau mỗi lần backend AI thực sự gọi provider, kể cả khi provider trả lỗi.
const recordAiUsage = async ({ userId, operation, provider, model, status, inputTokens = 0, outputTokens = 0 }) => {
  await pool.query(
    `INSERT INTO ai_usage_events (user_id, operation, provider, model, status, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, operation, provider, model, status, inputTokens, outputTokens]);
};

module.exports = { recordRecipeEvents, recordAiUsage };
