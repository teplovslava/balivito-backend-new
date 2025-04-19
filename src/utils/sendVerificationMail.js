import nodemailer from 'nodemailer';

export const sendVerificationEmail = async (email, token) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.MAIL_ADDRESS,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  const verifyLink = `${process.env.SITE_URL}/auth/verify?email=${email}&token=${token}`;

  await transporter.sendMail({
    from: `"Balivito" <${process.env.MAIL_ADDRESS}>`,
    to: email,
    subject: 'Подтверждение регистрации',
    html: `
      <h2>Подтверждение почты</h2>
      <p>Для активации аккаунта перейдите по ссылке:</p>
      <a href="${verifyLink}">${verifyLink}</a>
    `,
  });
};
