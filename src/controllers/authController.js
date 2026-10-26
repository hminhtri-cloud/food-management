const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/database");
const crypto = require("crypto");
const roleMiddleware = require("../middlewares/roleMiddleware");

const register = async (req, res) => {
  try {
    const { email, phone, password, fullName } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        message: "Email hoặc số điện thoại là bắt buộc",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu phải có ít nhất 6 ký tự",
      });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [email || null, phone || null],
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        message: "Email hoặc số điện thoại đã được sử dụng",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, phone, password_hash, full_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, phone, full_name, role, status, created_at`,
      [email || null, phone || null, passwordHash, fullName || null],
    );

    return res.status(201).json({
      message: "Đăng ký thành công",
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        message: "Vui lòng nhập email/số điện thoại và mật khẩu",
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 OR phone = $1",
      [identifier],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Thông tin đăng nhập không đúng",
      });
    }

    const user = result.rows[0];

    if (user.status !== "ACTIVE") {
      return res.status(403).json({
        message: "Tài khoản không hoạt động",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      password,
      user.password_hash,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Thông tin đăng nhập không đúng",
      });
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      },
    );

    const refreshToken = crypto.randomBytes(64).toString("hex");

    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, refreshTokenHash],
    );

    return res.json({
      message: "Đăng nhập thành công",
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName: user.full_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        message: "Refresh token là bắt buộc",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    const result = await pool.query(
      `SELECT rt.user_id, u.role
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()
         AND u.status = 'ACTIVE'`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Refresh token không hợp lệ hoặc đã hết hạn",
      });
    }

    const user = result.rows[0];

    const accessToken = jwt.sign(
      {
        userId: user.user_id,
        role: user.role,
      },
      process.env.JWT_ACCESS_SECRET,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      },
    );

    return res.json({
      accessToken,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        message: "Refresh token là bắt buộc",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1
         AND revoked_at IS NULL`,
      [tokenHash],
    );

    return res.json({
      message: "Đăng xuất thành công",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Mật khẩu mới phải có ít nhất 6 ký tự",
      });
    }

    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.userId],
    );

    const user = result.rows[0];

    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password_hash,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Mật khẩu hiện tại không đúng",
      });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, req.user.userId],
    );

    return res.json({
      message: "Đổi mật khẩu thành công",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  changePassword,
};
