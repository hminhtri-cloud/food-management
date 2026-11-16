const { pool, endpoint, fail, id, text, body, boolean, transaction, lockUser } = require("../services/workflowService");

const settingsColumns = 'enabled, to_char(reminder_time, \'HH24:MI\') AS "reminderTime", timezone, days_before AS "daysBefore", updated_at AS "updatedAt"';
const defaults = { enabled: false, reminderTime: "09:00", timezone: "Asia/Ho_Chi_Minh", daysBefore: 3 };
const getSettings = endpoint(async (req, res) => {
  const result = await pool.query(`SELECT ${settingsColumns} FROM notification_settings WHERE user_id = $1`, [req.user.userId]);
  res.json({ settings: result.rows[0] || defaults });
});
const updateSettings = endpoint(async (req, res) => {
  const data = body(req.body);
  const allowed = ["enabled", "reminderTime", "timezone", "daysBefore"];
  if (!allowed.some((key) => Object.hasOwn(data, key))) fail(400, "Cần ít nhất một trường cài đặt thông báo");
  if (data.enabled !== undefined) boolean(data.enabled, "enabled");
  if (data.reminderTime !== undefined && (typeof data.reminderTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.reminderTime))) fail(400, "reminderTime phải là HH:mm");
  if (data.daysBefore !== undefined && (!Number.isInteger(data.daysBefore) || data.daysBefore < 0 || data.daysBefore > 30)) fail(400, "daysBefore từ 0 đến 30");
  if (data.timezone !== undefined) {
    text(data.timezone, "timezone", 100);
    if (!(await pool.query("SELECT name FROM pg_timezone_names WHERE name = $1", [data.timezone])).rows.length) fail(400, "timezone phải là múi giờ IANA hợp lệ");
  }
  const settings = await transaction(async (client) => {
    await lockUser(client, req.user.userId);
    const current = (await client.query(`SELECT ${settingsColumns} FROM notification_settings WHERE user_id = $1`, [req.user.userId])).rows[0] || defaults;
    const value = { ...current, ...Object.fromEntries(allowed.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]])) };
    const result = await client.query(`INSERT INTO notification_settings (user_id,enabled,reminder_time,timezone,days_before)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET enabled=EXCLUDED.enabled, reminder_time=EXCLUDED.reminder_time,
      timezone=EXCLUDED.timezone, days_before=EXCLUDED.days_before, updated_at=NOW() RETURNING ${settingsColumns}`,
    [req.user.userId, value.enabled, value.reminderTime, value.timezone, value.daysBefore]);
    return result.rows[0];
  });
  res.json({ settings });
});
const registerDevice = endpoint(async (req, res) => {
  const data = body(req.body);
  const token = text(data.fcmToken, "fcmToken", 2048);
  if (!/^[\x21-\x7E]{20,2048}$/.test(token)) fail(400, "fcmToken cần 20–2048 ký tự ASCII không có khoảng trắng");
  const platform = data.platform === undefined ? "ANDROID" : data.platform;
  if (!["ANDROID", "IOS"].includes(platform)) fail(400, "platform chỉ nhận ANDROID hoặc IOS");
  // Token của cùng thiết bị chuyển sang tài khoản đang đăng nhập; tránh gửi cho chủ cũ.
  const result = await pool.query(`INSERT INTO user_devices (user_id,fcm_token,platform) VALUES ($1,$2,$3)
    ON CONFLICT(fcm_token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,enabled=TRUE,updated_at=NOW()
    RETURNING id, platform, enabled, created_at AS "createdAt", updated_at AS "updatedAt"`, [req.user.userId, token, platform]);
  res.status(201).json({ device: result.rows[0] });
});
const removeDevice = endpoint(async (req, res) => {
  const result = await pool.query("DELETE FROM user_devices WHERE id = $1 AND user_id = $2 RETURNING id", [id(req.params.id), req.user.userId]);
  if (!result.rows.length) fail(404, "Không tìm thấy thiết bị của bạn");
  res.json({ message: "Đã hủy đăng ký thiết bị" });
});

module.exports = { getSettings, updateSettings, registerDevice, removeDevice };
