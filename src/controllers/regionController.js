const pool = require("../config/database");

const getRegions = async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name FROM regions ORDER BY id");
    return res.json({ regions: result.rows });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Lỗi máy chủ" });
  }
};

module.exports = { getRegions };
