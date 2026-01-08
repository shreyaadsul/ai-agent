import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Only create transporter if credentials exist
const hasCredentials = (process.env.MAIL_USERNAME || process.env.EMAIL_USER) && (process.env.MAIL_PASSWORD || process.env.EMAIL_PASS);

let transporter;
if (hasCredentials) {
    transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.MAIL_USERNAME || process.env.EMAIL_USER,
            pass: process.env.MAIL_PASSWORD || process.env.EMAIL_PASS,
        },
    });
}

export const sendMail = async (subject, text) => {
    if (!hasCredentials || !transporter) {
        console.warn("Skipping email notification: No email credentials found in .env (MAIL_USERNAME/MAIL_PASSWORD).");
        return;
    }

    try {
        const mailOptions = {
            from: process.env.MAIL_USERNAME || process.env.EMAIL_USER,
            to: process.env.MAIL_TO_ADDRESS || process.env.MAIL_USERNAME || process.env.EMAIL_USER,
            subject: subject,
            text: text,
        };

        await transporter.sendMail(mailOptions);
        console.log("Email sent successfully");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};
