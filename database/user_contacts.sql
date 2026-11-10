-- Áp dụng cho database đã có bảng users. Không sửa/xóa dữ liệu hiện có.
-- Nếu có hai email chỉ khác hoa/thường, cần xử lý trùng trước khi chạy lại.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON users (LOWER(email)) WHERE email IS NOT NULL;
COMMIT;
