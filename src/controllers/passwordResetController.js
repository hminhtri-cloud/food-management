const crypto = require("crypto");
const bcrypt = require("bcrypt");
const pool = require("../config/database");
const { sendPasswordResetOtp } = require("../services/emailService");

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        message: "Vui lòng nhập email",
      });
    }

    // Trả cùng thông báo dù email có tồn tại hay không.
    const message =
      "Nếu email thuộc tài khoản đang hoạt động, mã OTP sẽ được gửi. Vui lòng kiểm tra hộp thư.";

    const userResult = await pool.query(
      `SELECT id, email
       FROM users
       WHERE LOWER(email) = LOWER($1)
         AND status = 'ACTIVE'`,
      [email.trim()],
    );

    if (userResult.rows.length === 0) {
      return res.json({ message });
    }

    const user = userResult.rows[0];

    // Chờ ít nhất 60 giây giữa hai lần yêu cầu.
    const recentOtp = await pool.query(
      `SELECT id
       FROM password_reset_otps
       WHERE user_id = $1
         AND created_at > NOW() - INTERVAL '60 seconds'
       LIMIT 1`,
      [user.id],
    );

    if (recentOtp.rows.length > 0) {
      return res.json({ message });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await pool.query(
      `INSERT INTO password_reset_otps
         (user_id, otp_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
      [user.id, otpHash],
    );

    await sendPasswordResetOtp(user.email, otp);

    return res.json({ message });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      message: "Không thể gửi OTP lúc này, vui lòng thử lại sau",
    });
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body || {};

  if (
    typeof email !== "string" ||
    !email.trim() ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp) ||
    typeof newPassword !== "string" ||
    newPassword.length < 6 ||
    Buffer.byteLength(newPassword, "utf8") > 72
  ) {
    return res.status(400).json({
      message:
        "Nhập email, OTP 6 số và mật khẩu mới từ 6 ký tự, tối đa 72 byte",
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Khóa bản ghi trong lúc kiểm tra và sử dụng OTP.
    const result = await client.query(
      `SELECT o.id, o.user_id, o.otp_hash, o.attempts,
              o.used_at, o.expires_at > NOW() AS is_valid
       FROM password_reset_otps o
       JOIN users u ON u.id = o.user_id
       WHERE LOWER(u.email) = LOWER($1)
         AND u.status = 'ACTIVE'
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT 1
       FOR UPDATE OF o, u`,
      [email.trim()],
    );

    const record = result.rows[0];

    if (!record || record.used_at || !record.is_valid || record.attempts >= 5) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message: "OTP không hợp lệ, đã hết hạn hoặc vượt số lần thử",
      });
    }

    const isCorrect = await bcrypt.compare(otp, record.otp_hash);

    if (!isCorrect) {
      await client.query(
        `UPDATE password_reset_otps
         SET attempts = attempts + 1
         WHERE id = $1`,
        [record.id],
      );

      await client.query("COMMIT");

      return res.status(400).json({
        message: "OTP không đúng",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE users
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, record.user_id],
    );

    // Vô hiệu hóa các OTP của tài khoản sau khi đặt lại mật khẩu.
    await client.query(
      `UPDATE password_reset_otps
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [record.user_id],
    );

    // Thu hồi refresh token của các phiên đăng nhập cũ.
    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [record.user_id],
    );

    await client.query("COMMIT");

    return res.json({
      message: "Đặt lại mật khẩu thành công, vui lòng đăng nhập lại",
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(console.error);
    }

    console.error(error.message);

    return res.status(500).json({
      message: "Không thể đặt lại mật khẩu lúc này",
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
};
