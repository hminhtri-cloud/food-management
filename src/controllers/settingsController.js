const bcrypt = require("bcrypt");
const pool = require("../config/database");

const getProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, phone, full_name, avatar_url, role, status, created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng",
      });
    }

    return res.json({
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { fullName, avatarUrl } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET full_name = COALESCE($1, full_name),
           avatar_url = COALESCE($2, avatar_url),
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, phone, full_name, avatar_url, role, status`,
      [fullName || null, avatarUrl || null, req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy người dùng",
      });
    }

    return res.json({
      message: "Cập nhật hồ sơ thành công",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const contactFields = {
  email: {
    label: "Email",
    normalize: (value) => value.trim().toLowerCase(),
    isValid: (value) => value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    error: "Email không hợp lệ hoặc dài quá 255 ký tự",
    lookup: "LOWER(email) = $1",
  },
  phone: {
    label: "Số điện thoại",
    normalize: (value) => value.trim(),
    isValid: (value) => /^\+?[0-9]{8,15}$/.test(value),
    error: "Số điện thoại phải có từ 8 đến 15 chữ số, có thể bắt đầu bằng dấu +",
    lookup: "phone = $1",
  },
};

// field chỉ nhận hằng số từ updateEmail/updatePhone, không lấy từ request.
const updateContact = async (req, res, field) => {
  const config = contactFields[field];
  const body = req.body || {};
  const { currentPassword } = body;

  if (typeof currentPassword !== "string" || !currentPassword) {
    return res.status(400).json({ message: "Vui lòng nhập mật khẩu hiện tại" });
  }

  if (typeof body[field] !== "string") {
    return res.status(400).json({ message: config.error });
  }

  const value = config.normalize(body[field]);
  if (!config.isValid(value)) {
    return res.status(400).json({ message: config.error });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const account = await client.query(
      `SELECT password_hash FROM users
       WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [req.user.userId],
    );

    if (!account.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy tài khoản đang hoạt động" });
    }

    if (!(await bcrypt.compare(currentPassword, account.rows[0].password_hash))) {
      await client.query("ROLLBACK");
      return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    const existing = await client.query(
      `SELECT id FROM users WHERE ${config.lookup} AND id <> $2 LIMIT 1`,
      [value, req.user.userId],
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: `${config.label} đã được sử dụng` });
    }

    const result = await client.query(
      `UPDATE users SET ${field} = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, phone, full_name, avatar_url, role, status`,
      [value, req.user.userId],
    );

    if (field === "email") {
      // Không để OTP đã gửi tới email cũ được dùng sau khi đổi địa chỉ.
      await client.query(
        `UPDATE password_reset_otps SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [req.user.userId],
      );
    }

    await client.query("COMMIT");
    return res.json({
      message: `Đổi ${config.label.toLowerCase()} thành công`,
      user: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(console.error);
    // Unique index bảo vệ cả trường hợp hai request cập nhật cùng lúc.
    if (error.code === "23505") {
      return res.status(409).json({ message: `${config.label} đã được sử dụng` });
    }
    console.error(error.message);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  } finally {
    if (client) client.release();
  }
};

const updateEmail = (req, res) => updateContact(req, res, "email");
const updatePhone = (req, res) => updateContact(req, res, "phone");

const deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        message: "Mật khẩu là bắt buộc",
      });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1 AND status = 'ACTIVE'",
      [req.user.userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Không tìm thấy tài khoản",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      result.rows[0].password_hash,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Mật khẩu không đúng",
      });
    }

    await pool.query(
      `UPDATE users
       SET status = 'DELETED', updated_at = NOW()
       WHERE id = $1`,
      [req.user.userId],
    );

    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1
         AND revoked_at IS NULL`,
      [req.user.userId],
    );

    return res.json({
      message: "Xóa tài khoản thành công",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  updateEmail,
  updatePhone,
  deleteAccount,
};
