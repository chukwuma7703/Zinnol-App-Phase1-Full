// Exercise success path by injecting a simple aiProvider stub; avoids ESM mock ordering issues.
import { vi } from 'vitest';

describe('AIPedagogicalCoach provider success paths', () => {
    const ORIGINAL_ENV = { ...process.env };

    afterEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env = { ...ORIGINAL_ENV };
    });

    test('Gemini-like provider success returns parsed sections', async () => {
        vi.resetModules();
        const mod = await import('../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        // Inject a stub provider that returns a response containing recognizable sections
        coach.aiProvider = {
            generateFeedback: vi.fn(async () => 'Strengths:\n- Good class\nSuggestions:\n- Try exit tickets')
        };

        const activity = { subject: { name: 'Math' }, classroom: { name: 'JSS1', level: 'Basic' }, durationInMinutes: 40, topic: 'Algebra', feedbackNote: 'Great class' };
        const analysis = { sentiment: { label: 'positive', score: 0.5 }, topics: [], challenges: [], successes: [], actionItems: [], studentMentions: 0 };

        const fb = await coach.generateAIFeedback(activity, analysis);
        expect(fb).toBeTruthy();
        expect(fb.strengths.length).toBeGreaterThan(0);
        expect(fb.suggestions.length).toBeGreaterThan(0);
    });

    test('OpenAI-like provider success returns parsed sections', async () => {
        vi.resetModules();
        const mod = await import('../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        coach.aiProvider = {
            generateFeedback: vi.fn(async () => 'Strengths: Great pacing\nSuggestions: Use visuals')
        };

        const activity = { subject: { name: 'Science' }, classroom: { name: 'SS1', level: 'Senior' }, durationInMinutes: 45, topic: 'Photosynthesis', feedbackNote: 'Good engagement' };
        const analysis = { sentiment: { label: 'positive', score: 0.4 }, topics: [], challenges: [], successes: [], actionItems: [], studentMentions: 0 };

        const fb = await coach.generateAIFeedback(activity, analysis);
        expect(fb).toBeTruthy();
        expect(Array.isArray(fb.strengths)).toBe(true);
    });
});
