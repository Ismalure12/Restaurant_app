import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export async function sendResetCode(email, code) {
  await transporter.sendMail({
    from: `KFG Menu <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your password reset code',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1A1A1A; margin-bottom: 8px;">Password Reset</h2>
        <p style="color: #666; font-size: 14px;">Your verification code is:</p>
        <div style="background: #F5F5F5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #E4002B;">${code}</span>
        </div>
        <p style="color: #999; font-size: 12px;">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendEmailVerificationCode(email, code) {
  await transporter.sendMail({
    from: `KFG Menu <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your email address',
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1A1A1A; margin-bottom: 8px;">Email Verification</h2>
        <p style="color: #666; font-size: 14px;">Your verification code is:</p>
        <div style="background: #F5F5F5; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #E4002B;">${code}</span>
        </div>
        <p style="color: #999; font-size: 12px;">This code expires in 15 minutes.</p>
      </div>
    `,
  });
}
