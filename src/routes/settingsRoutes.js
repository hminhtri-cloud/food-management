const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getProfile,
  updateProfile,
  updateEmail,
  updatePhone,
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
 *               avatarUrl:
 *                 type: string
 *                 description: URL ảnh đại diện
 *             example:
 *               fullName: "Nguyen Van A"
 *               avatarUrl: "https://example.com/avatar.jpg"
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

/**
 * @swagger
 * /api/settings/email:
 *   put:
 *     summary: Đổi email bằng mật khẩu hiện tại
 *     description: Email được trim và chuyển về chữ thường, không được trùng tài khoản khác. OTP quên mật khẩu cũ bị vô hiệu hóa. Chưa xác minh email mới qua OTP. Dùng email mới khi đăng nhập hoặc quên mật khẩu.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, currentPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 example: new-email@gmail.com
 *               currentPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Đổi email thành công, trả thông tin user đã cập nhật
 *       400:
 *         description: Thiếu mật khẩu hoặc email không hợp lệ
 *       401:
 *         description: Chưa đăng nhập, token không hợp lệ hoặc sai mật khẩu
 *       403:
 *         description: Tài khoản không thuộc cổng user
 *       404:
 *         description: Không tìm thấy tài khoản đang hoạt động
 *       409:
 *         description: Email đã được sử dụng
 *       500:
 *         description: Lỗi máy chủ
 * /api/settings/phone:
 *   put:
 *     summary: Đổi số điện thoại bằng mật khẩu hiện tại
 *     description: Nhận chuỗi từ 8 đến 15 chữ số, có thể bắt đầu bằng dấu +. Giữ số 0 đầu, không tự đổi 0 thành +84. Chưa xác minh số mới bằng SMS OTP. Dùng đúng định dạng đã lưu khi đăng nhập.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, currentPassword]
 *             properties:
 *               phone:
 *                 type: string
 *                 pattern: '^\+?[0-9]{8,15}$'
 *                 example: "0901234567"
 *               currentPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Đổi số điện thoại thành công, trả thông tin user đã cập nhật
 *       400:
 *         description: Thiếu mật khẩu hoặc số điện thoại không hợp lệ
 *       401:
 *         description: Chưa đăng nhập, token không hợp lệ hoặc sai mật khẩu
 *       403:
 *         description: Tài khoản không thuộc cổng user
 *       404:
 *         description: Không tìm thấy tài khoản đang hoạt động
 *       409:
 *         description: Số điện thoại đã được sử dụng
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/email", authMiddleware, updateEmail);
router.put("/phone", authMiddleware, updatePhone);

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
