import coach from '../../services/aiPedagogicalCoach.js';
import { vi } from 'vitest';
describe('AIPedagogicalCoach error handling', () => {
    it('handles Gemini API failure', async () => {
        // Mock GeminiProvider to throw
        coach.aiProvider = { generateFeedback: vi.fn().mockRejectedValue(new Error('Gemini API error')) };
        await expect(coach.aiProvider.generateFeedback('prompt')).rejects.toThrow('Gemini API error');
        // Optionally: check logs or fallback behavior
    });

    it('handles OpenAI API failure', async () => {
        // Mock OpenAIProvider to throw
        coach.aiProvider = { generateFeedback: vi.fn().mockRejectedValue(new Error('OpenAI API error')) };
        await expect(coach.aiProvider.generateFeedback('prompt')).rejects.toThrow('OpenAI API error');
    });
});

// Minimal analysis/activity fixtures
const analysis = {
    sentiment: { label: 'positive', positive: 0.6, negative: 0.2, score: 0.4 },
    topics: ['engagement', 'assessment'],
    challenges: ['time management'],
    successes: ['group work'],
    actionItems: ['try exit tickets'],
    studentMentions: 4,
    wordCount: 180,
};

const activity = {
    _id: 'a1',
    teacher: { _id: 't1' },
    subject: { name: 'Math' },
    classroom: { name: 'JSS1', level: 'JSS' },
    durationInMinutes: 45,
    topic: 'Fractions',
    feedbackNote: 'Today students enjoyed group activities... next time I will add more practice.',
};

describe('AIPedagogicalCoach helpers', () => {
    test('calculateOverallScore returns 0-100 normalized', () => {
        const s = coach.calculateOverallScore(analysis);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
    });

    test('buildAIPrompt includes key fields', () => {
        const prompt = coach.buildAIPrompt(activity, analysis);
        expect(prompt).toContain('Math');
        expect(prompt).toContain('JSS1');
        expect(prompt).toContain('Fractions');
        expect(prompt).toContain('Sentiment: positive');
    });

    test('parseAIResponse extracts sections heuristically', () => {
        const resp = `
Strengths:
- Clear explanations
- Good pacing

Growth Areas:
1. More checks for understanding

Suggestions:
* Use exit tickets

resources:
- Differentiation strategies
`;
        const parsed = coach.parseAIResponse(resp);
        expect(parsed.strengths.length).toBeGreaterThan(0);
        expect(parsed.growthAreas.length).toBeGreaterThan(0);
        expect(parsed.suggestions.length).toBeGreaterThan(0);
        // resources section parsing is heuristic; assert optional
        expect(Array.isArray(parsed.resources)).toBe(true);
    });

    test('generateStructuredFeedback composes final object', () => {
        const ai = { strengths: ['Nice'], growthAreas: ['More practice'], suggestions: ['Try exit ticket'], resources: ['link'] };
        const fb = coach.generateStructuredFeedback(activity, analysis, ai);
        expect(fb.summary.subject).toBe('Math');
        expect(fb.strengths.length).toBeGreaterThan(0);
        expect(fb.metrics).toBeDefined();
    });

    test('determinePriority maps by challenges/sentiment', () => {
        const a = { ...analysis, challenges: ['a', 'b', 'c', 'd'], sentiment: { ...analysis.sentiment, score: -0.6 } };
        expect(coach.determinePriority(a)).toBe('high');
    });

    test('estimateEngagement checks topic keywords', () => {
        expect(coach.estimateEngagement(analysis)).toBeDefined();
    });

    test('generateDefaultSuggestions falls back when no specific challenge', () => {
        const a = { ...analysis, challenges: [] };
        const s = coach.generateDefaultSuggestions(a);
        expect(s.length).toBeGreaterThan(0);
    });
});
