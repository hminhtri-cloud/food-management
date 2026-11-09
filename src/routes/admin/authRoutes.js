const express = require("express");
const { login, refreshAccessToken, logout, changePassword } = require("../../controllers/authController");
const authMiddleware = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Đăng nhập cổng admin (chỉ tài khoản ADMIN)
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email hoặc số điện thoại của admin
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: accessToken, refreshToken và thông tin admin
 *       400:
 *         description: Thiếu thông tin đăng nhập
 *       401:
 *         description: Sai thông tin đăng nhập
 *       403:
 *         description: Tài khoản không hoạt động hoặc không phải ADMIN
 * /api/auth/refresh:
 *   post:
 *     summary: Cấp access token mới cho admin
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: accessToken mới
 *       400:
 *         description: Thiếu refresh token
 *       401:
 *         description: Token không hợp lệ hoặc đã hết hạn
 *       403:
 *         description: Token không thuộc tài khoản ADMIN
 * /api/auth/logout:
 *   post:
 *     summary: Thu hồi refresh token của phiên admin
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Đã đăng xuất
 *       400:
 *         description: Thiếu refresh token
 * /api/auth/me:
 *   get:
 *     summary: Kiểm tra danh tính admin hiện tại
 *     tags: [Admin Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin trong token với role hiện tại từ database
 *       401:
 *         description: Chưa đăng nhập hoặc tài khoản không hoạt động
 *       403:
 *         description: Không phải ADMIN
 * /api/auth/admin-test:
 *   get:
 *     summary: Kiểm tra quyền admin (đã chuyển từ cổng user sang đây)
 *     tags: [Admin Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Có quyền ADMIN
 *       401:
 *         description: Chưa đăng nhập
 *       403:
 *         description: Không phải ADMIN
 * /api/auth/change-password:
 *   put:
 *     summary: Đổi mật khẩu admin
 *     tags: [Admin Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc mật khẩu hiện tại không đúng
 *       403:
 *         description: Không phải ADMIN
 */
router.post("/login", login);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
const requireAdmin = [authMiddleware, roleMiddleware("ADMIN")];
router.get("/me", ...requireAdmin, (req, res) => res.json({ message: "Bạn đã đăng nhập cổng admin", user: req.user }));
router.get("/admin-test", ...requireAdmin, (req, res) => res.json({ message: "Bạn có quyền ADMIN" }));
router.put("/change-password", ...requireAdmin, changePassword);

module.exports = router;
