const express = require("express");
const {
  register,
  login,
  refreshAccessToken,
  logout,
  changePassword,
} = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  forgotPassword,
  resetPassword,
} = require("../controllers/passwordResetController");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: API liên quan đến xác thực người dùng
 */

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin người dùng hiện tại
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 *       403:
 *         description: Tài khoản không thuộc cổng user
 */
router.get("/me", authMiddleware, (req, res) => {
  res.json({
    message: "Bạn đã đăng nhập",
    user: req.user,
  });
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Đăng ký tài khoản
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: test2@example.com
 *               phone:
 *                 type: string
 *                 example: "0901234567"
 *               password:
 *                 type: string
 *                 example: "123456"
 *               fullName:
 *                 type: string
 *                 example: Test User
 *     responses:
 *       201:
 *         description: Đăng ký thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       409:
 *         description: Email hoặc số điện thoại đã tồn tại
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập cổng user (chỉ tài khoản USER)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - password
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email hoặc số điện thoại của người dùng
 *                 example: test2@example.com
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Đăng nhập thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Email hoặc mật khẩu không đúng
 *       403:
 *         description: Tài khoản không hoạt động hoặc không phải USER
 */
router.post("/login", login);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Làm mới token truy cập
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "refresh_token_here"
 *     responses:
 *       200:
 *         description: Làm mới token thành công
 *       400:
 *         description: Refresh token là bắt buộc
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 *       403:
 *         description: Token không thuộc tài khoản USER
 */
router.post("/refresh", refreshAccessToken);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Đăng xuất
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: "refresh_token_here"
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 *       400:
 *         description: Refresh token là bắt buộc
 */
router.post("/logout", logout);

/**
 * @swagger
 * /api/auth/change-password:
 *   put:
 *     summary: Đổi mật khẩu
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "current_password"
 *               newPassword:
 *                 type: string
 *                 example: "new_password"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc mật khẩu hiện tại không đúng
 */
router.put("/change-password", authMiddleware, changePassword);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Gửi OTP quên mật khẩu qua email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: your-email@gmail.com
 *     responses:
 *       200:
 *         description: Đã tiếp nhận yêu cầu
 *       400:
 *         description: Chưa nhập email
 *       500:
 *         description: Không thể gửi OTP
 */
router.post("/forgot-password", forgotPassword);
/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu bằng OTP
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: your-email@gmail.com
 *               otp:
 *                 type: string
 *                 pattern: '^\d{6}$'
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 example: "new_password"
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ hoặc OTP sai, hết hạn, đã dùng
 *       500:
 *         description: Không thể đặt lại mật khẩu
 */
router.post("/reset-password", resetPassword);
module.exports = router;
