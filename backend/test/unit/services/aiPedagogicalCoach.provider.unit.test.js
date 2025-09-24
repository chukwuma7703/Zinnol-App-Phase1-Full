import { vi } from 'vitest';

vi.mock('@google/generative-ai', () => ({ GoogleGenerativeAI: vi.fn(() => ({ getGenerativeModel: vi.fn(() => ({ generateContent: vi.fn() })) })) }));
vi.mock('openai', () => ({
    default: vi.fn(() => ({ chat: { completions: { create: vi.fn() } } }))
}));
vi.mock('../../../models/Notification.js', () => ({
    default: vi.fn().mockImplementation(() => ({
        save: vi.fn().mockResolvedValue({}),
        constructor: { name: 'model' }
    }))
}));
vi.mock('../../../models/userModel.js', () => ({
    default: vi.fn().mockImplementation(() => ({
        save: vi.fn().mockResolvedValue({}),
        constructor: { name: 'model' }
    }))
}));
vi.mock('../../../models/teacherActivityModel.js', () => ({
    default: vi.fn().mockImplementation(() => ({
        save: vi.fn().mockResolvedValue({}),
        constructor: { name: 'model' }
    }))
}));
vi.mock('../../../config/monitoring.js', () => ({
    trackBusinessEvent: vi.fn()
}));
// Use direct path to utils/logger; vitest.config maps it too, but keep explicit mock lightweight
vi.mock('../../../utils/logger.js', () => ({ __esModule: true, default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('AIPedagogicalCoach provider init and error paths', () => {
    const OLD_ENV = process.env;
    beforeEach(() => { vi.resetModules(); process.env = { ...OLD_ENV }; });
    afterAll(() => { process.env = OLD_ENV; });

    test('initializes with null provider when API keys missing', async () => {
        delete process.env.GEMINI_API_KEY;
        delete process.env.OPENAI_API_KEY;
        process.env.AI_PROVIDER = 'gemini';
        vi.resetModules();
        const mod = await import('../../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        expect(coach.aiProvider === null).toBe(true);
    });

    test('generateAIFeedback returns null when provider throws', async () => {
        const mod = await import('../../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        coach.aiProvider = { generateFeedback: vi.fn(() => { throw new Error('boom'); }) };
        const activity = { subject: { name: 'Math' }, classroom: { name: 'JSS1', level: 'Basic' }, durationInMinutes: 40, topic: 'Algebra', feedbackNote: 'Good class' };
        const analysis = { sentiment: { label: 'positive' }, topics: [], challenges: [], successes: [] };
        const result = await coach.generateAIFeedback(activity, analysis);
        expect(result).toBeNull();
    });

    test('generateAIFeedback returns null when provider is null', async () => {
        const mod = await import('../../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        coach.aiProvider = null; // ensure null
        const activity = { subject: { name: 'Eng' }, classroom: { name: 'JSS2', level: 'Basic' }, durationInMinutes: 35, topic: 'Grammar', feedbackNote: 'ok' };
        const analysis = { sentiment: { label: 'neutral' }, topics: [], challenges: [], successes: [] };
        const result = await coach.generateAIFeedback(activity, analysis);
        expect(result).toBeNull();
    });
});
