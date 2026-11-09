-- Dữ liệu demo; source_url là liên kết tìm bài hướng dẫn, không phải nội dung tự tạo.
BEGIN;
INSERT INTO regions (name) VALUES ('Miền Bắc'), ('Miền Trung'), ('Miền Nam')
ON CONFLICT (name) DO NOTHING;

INSERT INTO recipes (slug, name, region_id, source_url)
SELECT x.slug, x.name, r.id, x.source_url
FROM (VALUES
    ('rau-muong-luoc', 'Rau muống luộc', 'Miền Bắc', 'https://www.bachhoaxanh.com/kinh-nghiem-hay/tim-kiem?key=rau%20muong%20luoc'),
    ('ga-kho-nuoc-mam', 'Gà kho nước mắm', 'Miền Trung', 'https://www.bachhoaxanh.com/kinh-nghiem-hay/tim-kiem?key=ga%20kho%20nuoc%20mam'),
    ('tom-sot-ca-chua', 'Tôm sốt cà chua', 'Miền Nam', 'https://www.bachhoaxanh.com/kinh-nghiem-hay/tim-kiem?key=tom%20sot%20ca%20chua')
) AS x(slug, name, region_name, source_url)
JOIN regions r ON r.name = x.region_name
ON CONFLICT (slug) DO NOTHING;

INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
SELECT r.id, i.id, x.quantity, x.unit
FROM (VALUES
    ('rau-muong-luoc', 'Rau muống', 1, 'bó'),
    ('rau-muong-luoc', 'Muối', 0.01, 'gói'),
    ('ga-kho-nuoc-mam', 'Thịt gà', 0.5, 'kg'),
    ('ga-kho-nuoc-mam', 'Nước mắm', 0.05, 'chai'),
    ('tom-sot-ca-chua', 'Tôm', 0.3, 'kg'),
    ('tom-sot-ca-chua', 'Cà chua', 0.2, 'kg'),
    ('tom-sot-ca-chua', 'Muối', 0.01, 'gói')
) AS x(slug, ingredient_name, quantity, unit)
JOIN recipes r ON r.slug = x.slug
JOIN ingredients i ON i.name = x.ingredient_name
ON CONFLICT (recipe_id, ingredient_id) DO NOTHING;
COMMIT;
