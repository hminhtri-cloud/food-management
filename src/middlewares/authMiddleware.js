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

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE id = $1 AND status = 'ACTIVE'`,
      [decoded.userId],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Tài khoản không còn hoạt động",
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token không hợp lệ hoặc đã hết hạn",
    });
  }
};

module.exports = authMiddleware;
