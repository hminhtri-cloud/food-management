const { randomUUID, createHash } = require("node:crypto");
const pool = require("../config/database");

const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const createFcmSender = async () => {
  const { initializeApp, applicationDefault } = require("firebase-admin/app");
  const { getMessaging } = require("firebase-admin/messaging");
  const credential = applicationDefault();
  // Fail ngay khi chạy worker nếu chưa cấu hình credentials, không đánh dấu job đã gửi.
  await credential.getAccessToken();
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  const app = initializeApp({ credential, ...(projectId ? { projectId } : {}) }, `expiry-${randomUUID()}`);
  return (message) => getMessaging(app).sendEachForMulticast(message);
};

const runReminderCycle = async ({ sendMulticast, now = new Date(), userId = null } = {}) => {
  if (typeof sendMulticast !== "function") throw new Error("Cần FCM sender đã được cấu hình");
  const leaseToken = randomUUID();
  const claimed = await pool.query(
    `WITH due AS (
      SELECT s.user_id, ($2::timestamptz AT TIME ZONE s.timezone)::date AS local_date
      FROM notification_settings s JOIN users u ON u.id = s.user_id
      WHERE s.enabled AND u.status = 'ACTIVE' AND u.role = 'USER'
        AND ($1::int IS NULL OR s.user_id = $1)
        AND ($2::timestamptz AT TIME ZONE s.timezone)::time >= s.reminder_time
        AND EXISTS (SELECT 1 FROM user_devices d WHERE d.user_id = s.user_id AND d.enabled)
        AND NOT EXISTS (SELECT 1 FROM expiry_reminders r WHERE r.user_id = s.user_id
          AND r.local_date = ($2::timestamptz AT TIME ZONE s.timezone)::date
          AND (r.status IN ('SENT','NO_ITEMS') OR r.attempts >= 5 OR r.lease_until > $2::timestamptz OR r.next_attempt_at > $2::timestamptz))
      ORDER BY s.user_id LIMIT 100
    ), claimed AS (
      INSERT INTO expiry_reminders (user_id,local_date,status,lease_until,lease_token)
      SELECT user_id,local_date,'PENDING',$2::timestamptz + INTERVAL '10 minutes',$3::uuid FROM due
      ON CONFLICT(user_id,local_date) DO UPDATE SET status='PENDING', attempts=expiry_reminders.attempts+1,
        lease_until=$2::timestamptz + INTERVAL '10 minutes',lease_token=$3::uuid,updated_at=$2::timestamptz
      WHERE expiry_reminders.status IN ('PENDING','FAILED') AND expiry_reminders.attempts < 5
        AND (expiry_reminders.lease_until IS NULL OR expiry_reminders.lease_until <= $2::timestamptz)
        AND expiry_reminders.next_attempt_at <= $2::timestamptz
      RETURNING *
    ) SELECT c.id,c.user_id,c.local_date::text AS local_date,s.days_before
      FROM claimed c JOIN notification_settings s ON s.user_id = c.user_id`, [userId, now, leaseToken]);
  const summary = { claimed: claimed.rows.length, sent: 0, failed: 0, noItems: 0 };
  for (const job of claimed.rows) {
    const finish = async (status) => pool.query(`UPDATE expiry_reminders SET status=$1,lease_until=NULL,
      next_attempt_at=$2::timestamptz + INTERVAL '5 minutes',updated_at=$2::timestamptz WHERE id=$3 AND lease_token=$4`, [status, now, job.id, leaseToken]);
    try {
      const active = async () => (await pool.query(`SELECT s.user_id FROM notification_settings s JOIN users u ON u.id=s.user_id
        WHERE s.user_id=$1 AND s.enabled AND u.status='ACTIVE' AND u.role='USER'`, [job.user_id])).rows.length > 0;
      if (!await active()) { await finish("FAILED"); summary.failed++; continue; }
      const count = (await pool.query(`SELECT COUNT(*)::int AS count FROM user_ingredients
        WHERE user_id=$1 AND quantity>0 AND expires_at BETWEEN $2::date AND $2::date + $3::int`, [job.user_id, job.local_date, job.days_before])).rows[0].count;
      if (!count) { await finish("NO_ITEMS"); summary.noItems++; continue; }
      const devices = (await pool.query(`SELECT d.id,d.fcm_token,rd.status,rd.token_hash FROM user_devices d
        LEFT JOIN reminder_deliveries rd ON rd.device_id=d.id AND rd.reminder_id=$1
        WHERE d.user_id=$2 AND d.enabled ORDER BY d.id`, [job.id, job.user_id])).rows
        .filter((device) => device.status !== "SENT" || device.token_hash !== tokenHash(device.fcm_token));
      let failed = false;
      for (let offset = 0; offset < devices.length; offset += 500) {
        if (!await active()) { failed = true; break; }
        // Đọc lại chủ sở hữu ngay trước khi gửi để bỏ thiết bị đã logout/chuyển tài khoản.
        const candidates = devices.slice(offset, offset + 500);
        const currentIds = new Set((await pool.query("SELECT id FROM user_devices WHERE user_id=$1 AND enabled AND id=ANY($2::int[])",
          [job.user_id, candidates.map((device) => device.id)])).rows.map((device) => device.id));
        const chunk = candidates.filter((device) => currentIds.has(device.id));
        if (!chunk.length) continue;
        const result = await sendMulticast({
          tokens: chunk.map((device) => device.fcm_token),
          notification: { title: "Kiểm tra tủ lạnh của bạn", body: `Bạn có ${count} lô nguyên liệu sắp hết hạn. Hãy chọn món để dùng sớm nhé!` },
          data: { type: "EXPIRY_REMINDER", localDate: job.local_date, expiringCount: String(count) },
          android: { priority: "normal", notification: { channelId: "expiry_reminders" } },
        });
        if (!Array.isArray(result.responses) || result.responses.length !== chunk.length) throw new Error("FCM trả response không hợp lệ");
        for (let index = 0; index < chunk.length; index++) {
          const device = chunk[index], response = result.responses[index];
          const invalid = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(response.error?.code);
          const status = response.success ? "SENT" : invalid ? "INVALID" : "FAILED";
          if (status === "FAILED") failed = true;
          await pool.query(`INSERT INTO reminder_deliveries (reminder_id,device_id,token_hash,status) VALUES ($1,$2,$3,$4)
            ON CONFLICT(reminder_id,device_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,status=EXCLUDED.status,updated_at=NOW()`,
          [job.id, device.id, tokenHash(device.fcm_token), status]);
          if (invalid) await pool.query("UPDATE user_devices SET enabled=FALSE,updated_at=NOW() WHERE id=$1 AND user_id=$2 AND fcm_token=$3", [device.id, job.user_id, device.fcm_token]);
        }
      }
      await finish(failed ? "FAILED" : "SENT");
      summary[failed ? "failed" : "sent"]++;
    } catch (error) {
      await finish("FAILED");
      summary.failed++;
      // Không log FCM token, credentials hoặc nội dung error có thể chứa token.
      console.error("Expiry reminder failed", { reminderId: job.id, code: error.code || "SEND_FAILED" });
    }
  }
  return summary;
};

module.exports = { createFcmSender, runReminderCycle };
