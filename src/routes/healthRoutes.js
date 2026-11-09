const express = require("express");
const pool = require("../config/database");
const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Kiểm tra backend và kết nối database
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Hệ thống sẵn sàng, trả tên cổng user hoặc admin
 *       500:
 *         description: Không kết nối được database
 */
router.get("/", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    return res.json({ message: "Backend and database are running", portal: req.app.locals.portal });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Database connection failed" });
  }
});

module.exports = router;
