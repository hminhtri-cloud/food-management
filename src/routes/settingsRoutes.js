const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getProfile,
  updateProfile,
  deleteAccount,
} = require("../controllers/settingsController");

const router = express.Router();

//swagger tags
/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: API liên quan đến cài đặt người dùng
 */

/**
 * @swagger
 * /api/settings/profile:
 *   get:
 *     summary: Lấy thông tin hồ sơ người dùng
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thông tin hồ sơ người dùng
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 */
router.get("/profile", authMiddleware, getProfile);

/**
 * @swagger
 * /api/settings/profile:
 *   put:
 *     summary: Cập nhật thông tin hồ sơ người dùng
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 description: Tên đầy đủ của người dùng
 *               phone:
 *                 type: string
 *                 description: Số điện thoại của người dùng
 *             example:
 *               fullName: "Nguyen Van A"
 *               phone: "0123456789"
 *     responses:
 *       200:
 *         description: Cập nhật thông tin hồ sơ thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc không có quyền
 *       404:
 *         description: Không tìm thấy người dùng
 */
router.put("/profile", authMiddleware, updateProfile);

/** * @swagger
 * /api/settings/delete-account:
 *   delete:
 *     summary: Xóa tài khoản người dùng
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 description: Mật khẩu của người dùng để xác nhận xóa tài khoản
 *             example:
 *               password: "your_password"
 *     responses:
 *       200:
 *         description: Xóa tài khoản thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       401:
 *         description: Chưa đăng nhập hoặc mật khẩu không đúng
 *       404:
 *         description: Không tìm thấy tài khoản
 */
router.delete("/delete-account", authMiddleware, deleteAccount);

module.exports = router;
