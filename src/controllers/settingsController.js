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
  deleteAccount,
};
