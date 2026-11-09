const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const { getRegions } = require("../controllers/regionController");
const router = express.Router();

/**
 * @swagger
 * /api/regions:
 *   get:
 *     summary: Danh sách vùng miền
 *     tags: [Regions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách regions gồm id và name
 *       401:
 *         description: Chưa đăng nhập
 */
router.get("/", authMiddleware, getRegions);
module.exports = router;
