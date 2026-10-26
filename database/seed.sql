INSERT INTO ingredient_categories (name)
VALUES
    ('Rau'),
    ('Thịt'),
    ('Hải sản'),
    ('Gia vị')
ON CONFLICT (name) DO NOTHING;

INSERT INTO ingredients (category_id, name, default_unit)
SELECT c.id, x.name, x.unit
FROM (
    VALUES
        ('Rau', 'Rau muống', 'bó'),
        ('Rau', 'Cà chua', 'kg'),
        ('Thịt', 'Thịt heo', 'kg'),
        ('Thịt', 'Thịt gà', 'kg'),
        ('Hải sản', 'Tôm', 'kg'),
        ('Gia vị', 'Muối', 'gói'),
        ('Gia vị', 'Nước mắm', 'chai')
) AS x(category_name, name, unit)
JOIN ingredient_categories c
    ON c.name = x.category_name
ON CONFLICT (name) DO NOTHING;