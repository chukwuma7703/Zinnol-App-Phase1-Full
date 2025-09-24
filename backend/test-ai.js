import dotenv from "dotenv";
dotenv.config();

import AIPedagogicalCoach from "./services/aiPedagogicalCoach.js";

const coach = new AIPedagogicalCoach();

console.log("Testing AI Pedagogical Coach...");

const activity = {
    subject: { name: "Math" },
    classroom: { name: "JSS1", level: "Basic" },
    durationInMinutes: 40,
    topic: "Algebra",
    feedbackNote:
        "Students struggled with understanding variables but showed good engagement with the interactive examples. Next time I will use more visual aids."
};

async function testAI() {
    try {
        console.log("Performing analysis...");
        const analysis = await coach.performAnalysis(activity);
        console.log("Analysis completed. Generating AI feedback...");
        const result = await coach.generateAIFeedback(activity, analysis);

        console.log("AI Feedback generated successfully!");
        console.log("Full response:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error:", error.message);
        console.error("Stack:", error.stack);
    } finally {
        console.log("Test completed.");
        process.exit(0);
    }
}

testAI();
