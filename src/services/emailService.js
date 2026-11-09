const transporter = require("../config/mailer");

const sendPasswordResetOtp = async (email, otp) => {
  await transporter.sendMail({
    from: `"Food Management" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Mã OTP đặt lại mật khẩu Food Management",
    text: [
      `Mã OTP đặt lại mật khẩu của bạn là: ${otp}`,
      "Mã có hiệu lực trong 5 phút.",
      "Không chia sẻ mã này cho người khác.",
      "Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.",
    ].join("\n\n"),
  });
};

module.exports = {
  sendPasswordResetOtp,
};
