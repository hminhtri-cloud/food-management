BEGIN;

-- Mỗi dòng là một lượt xem chi tiết hoặc một lần món xuất hiện trong trang gợi ý.
CREATE TABLE IF NOT EXISTS recipe_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('VIEW', 'RECOMMENDATION')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS recipe_events_time_idx ON recipe_events(created_at);
CREATE INDEX IF NOT EXISTS recipe_events_recipe_idx ON recipe_events(recipe_id, created_at);

-- Backend AI sẽ ghi một dòng cho mỗi lần gọi provider; không chứa prompt/API key.
CREATE TABLE IF NOT EXISTS ai_usage_events (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    operation VARCHAR(30) NOT NULL CHECK (operation IN ('CHAT', 'IMAGE_ANALYSIS')),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'ERROR')),
    input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_time_idx ON ai_usage_events(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON ai_usage_events(user_id);

COMMIT;
