BEGIN;

CREATE TABLE IF NOT EXISTS units (
    code VARCHAR(30) PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    conversion_group VARCHAR(30) NOT NULL,
    base_factor INTEGER NOT NULL CHECK (base_factor > 0),
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb
);
INSERT INTO units (code, name, conversion_group, base_factor, aliases) VALUES
('g', 'Gam', 'mass', 1, '["gam","gram"]'),
('kg', 'Kilôgam', 'mass', 1000, '["kilogram","kilôgam"]'),
('ml', 'Mililít', 'volume', 1, '["mililit","mililít"]'),
('l', 'Lít', 'volume', 1000, '["lit","lít"]'),
('cái', 'Cái', 'piece', 1, '["cai"]'),
('quả', 'Quả', 'fruit', 1, '["qua"]'),
('bó', 'Bó', 'bunch', 1, '["bo"]')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS shopping_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    purchased_at TIMESTAMPTZ,
    moved_at TIMESTAMPTZ,
    fridge_item_id INTEGER REFERENCES user_ingredients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shopping_items_user_idx ON shopping_items(user_id, id);

CREATE TABLE IF NOT EXISTS cooking_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    recipe_name VARCHAR(200) NOT NULL,
    servings INTEGER NOT NULL CHECK (servings BETWEEN 1 AND 100),
    note VARCHAR(1000),
    request_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, request_key)
);
CREATE INDEX IF NOT EXISTS cooking_sessions_user_idx ON cooking_sessions(user_id, id);
CREATE TABLE IF NOT EXISTS cooking_consumptions (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES cooking_sessions(id) ON DELETE CASCADE,
    -- ID và tên lô là snapshot: lịch sử vẫn còn khi lô/nguyên liệu/công thức bị xóa.
    fridge_item_id INTEGER NOT NULL,
    ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE SET NULL,
    ingredient_name VARCHAR(150) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL
);
CREATE INDEX IF NOT EXISTS cooking_consumptions_session_idx ON cooking_consumptions(session_id);

CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token VARCHAR(2048) NOT NULL UNIQUE,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ANDROID', 'IOS')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_devices_user_idx ON user_devices(user_id);
CREATE TABLE IF NOT EXISTS notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_time TIME NOT NULL DEFAULT '09:00',
    timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    days_before INTEGER NOT NULL DEFAULT 3 CHECK (days_before BETWEEN 0 AND 30),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS expiry_reminders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING','SENT','FAILED','NO_ITEMS')),
    attempts INTEGER NOT NULL DEFAULT 1,
    lease_token UUID,
    lease_until TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, local_date)
);
CREATE TABLE IF NOT EXISTS reminder_deliveries (
    reminder_id INTEGER NOT NULL REFERENCES expiry_reminders(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES user_devices(id) ON DELETE CASCADE,
    -- Snapshot để một thiết bị chuyển chủ/token không kế thừa trạng thái gửi cũ.
    token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('SENT','FAILED','INVALID')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(reminder_id, device_id)
);

COMMIT;
