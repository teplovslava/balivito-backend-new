// import nodemailer from 'nodemailer';

// export const sendVerificationEmail = async (email, token) => {
//   const transporter = nodemailer.createTransport({
//     host: 'smtp.timeweb.ru',
//     port: 465,
//     secure: true, // TLS (если используешь порт 465)
//     auth: {
//       user: process.env.MAIL_ADDRESS,
//       pass: process.env.MAIL_PASSWORD,
//     },
//   });

//   const verifyLink = `${process.env.SITE_URL}/auth/verify?email=${email}&token=${token}`;

//   await transporter.sendMail({
//     from: `"Balivito" <${process.env.MAIL_ADDRESS}>`,
//     to: email,
//     subject: 'Подтверждение регистрации',
//     html: `
//       <h2>Подтверждение почты</h2>
//       <p>Для активации аккаунта перейдите по ссылке:</p>
//       <a href="${verifyLink}">${verifyLink}</a>
//     `,
//   });
// };

import { Resend } from "resend";

const resend = new Resend("re_LP6kCWZq_BfnF1ZDfupHgxrM2i61XWetz");

export const sendVerificationEmail = async (email, token) => {
  const verifyLink = `${process.env.SITE_URL}/auth/verify?email=${email}&token=${token}`;

  await resend.emails.send({
    from: "onboarding@resend.dev", // разрешённый отправитель Resend
    to: email,
    subject: "Подтверждение регистрации",
    html: `
      <h2>Подтверждение почты</h2>
      <p>Для активации аккаунта перейдите по ссылке:</p>
      <a href="${verifyLink}">${verifyLink}</a>
    `,
  });
};
