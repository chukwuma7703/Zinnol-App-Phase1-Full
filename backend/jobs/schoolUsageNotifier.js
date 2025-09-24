// backend/jobs/schoolUsageNotifier.js
import School from "../models/School.js";
import User from "../models/userModel.js";
import { sendNotification } from "../utils/notificationUtils.js"; // You can implement this for email/dashboard alerts

// Milestones in months
const MILESTONES = [4, 7, 12];

export async function checkSchoolUsageAndNotify() {
    const now = new Date();
    const schools = await School.find({ isActive: true });

    for (const school of schools) {
        const created = school.createdAt;
        if (!created) continue;
        const monthsUsed = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth());

        for (const milestone of MILESTONES) {
            // Check if milestone is reached and not already notified
            if (monthsUsed === milestone && !(school.notifiedMilestones || []).includes(milestone)) {
                // Find global admins to notify
                const admins = await User.find({ role: "GLOBAL_SUPER_ADMIN" });
                for (const admin of admins) {
                    await sendNotification({
                        to: admin.email,
                        subject: `School Usage Milestone: ${school.name}`,
                        message: `Congratulations! School '${school.name}' has reached a usage milestone: ${milestone} months on Zinnol App.`
                    });
                }
                // Mark milestone as notified
                school.notifiedMilestones = [...(school.notifiedMilestones || []), milestone];
                await school.save();
            }
        }
    }
}

// You can schedule this job with node-cron or any scheduler in your server.js
