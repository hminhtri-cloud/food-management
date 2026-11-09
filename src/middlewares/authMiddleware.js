const jwt = require("jsonwebtoken");
const pool = require("../config/database");

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Chưa đăng nhập",
    });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    return res.status(401).json({
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, role
       FROM users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [decoded.userId],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Tài khoản không còn hoạt động",
      });
    }

    const user = result.rows[0];
    if (req.app.locals.requiredRole && user.role !== req.app.locals.requiredRole) {
      return res.status(403).json({
        message: "Tài khoản không có quyền truy cập cổng này",
      });
    }

    // Lấy role hiện tại từ DB, không tin role cũ còn trong JWT.
    req.user = { ...decoded, userId: user.id, role: user.role };
    next();
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({
      message: "Lỗi máy chủ",
    });
  }
};

module.exports = authMiddleware;
