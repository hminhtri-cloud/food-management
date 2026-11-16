const { setTimeout: delay } = require("node:timers/promises");
const pool = require("../config/database");
const { createFcmSender, runReminderCycle } = require("../services/reminderService");

const main = async () => {
  const sendMulticast = await createFcmSender();
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => controller.abort());
  console.log("Expiry reminder worker started (poll every 60s)");
  do {
    try { console.log("Expiry reminder cycle", await runReminderCycle({ sendMulticast })); }
    catch (error) { console.error("Expiry reminder cycle failed", { code: error.code || "DATABASE_ERROR" }); }
    if (process.argv.includes("--once")) break;
    try { await delay(60000, undefined, { signal: controller.signal }); }
    catch (error) { if (error.name !== "AbortError") throw error; }
  } while (!controller.signal.aborted);
};

if (require.main === module) {
  main().catch(() => {
    console.error("Không thể chạy reminder worker. Kiểm tra database, Firebase project, ADC/GOOGLE_APPLICATION_CREDENTIALS và quyền gửi FCM.");
    process.exitCode = 1;
  }).finally(() => pool.end());
}

module.exports = main;
