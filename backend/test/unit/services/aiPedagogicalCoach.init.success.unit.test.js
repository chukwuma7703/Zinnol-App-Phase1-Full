// Covers successful provider initialization branches without making API calls

import { vi } from 'vitest';

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
vi.mock('../../../utils/logger.js', () => ({ __esModule: true, default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('AIPedagogicalCoach provider init success paths', () => {
    const OLD_ENV = process.env;
    beforeEach(() => { vi.resetModules(); process.env = { ...OLD_ENV }; });
    afterEach(() => { process.env = OLD_ENV; vi.clearAllMocks(); });

    test('initializes Gemini provider when GEMINI_API_KEY is set', async () => {
        process.env.AI_PROVIDER = 'gemini';
        process.env.GEMINI_API_KEY = 'test-key';
        vi.doMock('@google/generative-ai', () => ({
            GoogleGenerativeAI: function MockGenAI() { return { getGenerativeModel: () => ({}) }; }
        }), { virtual: true });

        const mod = await import('../../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        expect(coach.aiProvider).toBeTruthy();
        // sanity: provider has a generateFeedback method
        expect(typeof coach.aiProvider.generateFeedback).toBe('function');
    });

    test('initializes OpenAI provider when OPENAI_API_KEY is set', async () => {
        process.env.AI_PROVIDER = 'openai';
        process.env.OPENAI_API_KEY = 'test-key';
        vi.doMock('openai', () => ({ __esModule: true, default: function MockOpenAI() { return { chat: { completions: {} } }; } }), { virtual: true });

        const mod = await import('../../../services/aiPedagogicalCoach.js');
        const coach = mod.default;
        expect(coach.aiProvider).toBeTruthy();
        expect(typeof coach.aiProvider.generateFeedback).toBe('function');
    });
});
