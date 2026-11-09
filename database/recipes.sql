BEGIN;

CREATE TABLE IF NOT EXISTS regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS recipes (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(150) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    region_id INTEGER NOT NULL REFERENCES regions(id),
    image_url TEXT,
    source_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
    quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(30) NOT NULL,
    PRIMARY KEY (recipe_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS recipes_region_idx ON recipes(region_id);
CREATE INDEX IF NOT EXISTS user_ingredients_user_ingredient_idx
    ON user_ingredients(user_id, ingredient_id);

COMMIT;
