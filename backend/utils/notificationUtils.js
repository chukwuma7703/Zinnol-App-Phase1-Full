// backend/utils/notificationUtils.js
// Dummy notification utility. Replace with actual email or dashboard notification logic.
export async function sendNotification({ to, subject, message }) {
    // For demo, just log. Replace with email or dashboard alert logic.
    console.log(`NOTIFY: To: ${to} | Subject: ${subject} | Message: ${message}`);
    // You can integrate nodemailer, push notifications, or dashboard alerts here.
}
