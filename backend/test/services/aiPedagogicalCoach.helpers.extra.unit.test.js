import coach from '../../services/aiPedagogicalCoach.js';

// Reusable minimal analysis/activity fixtures
const baseAnalysis = {
    sentiment: { label: 'neutral', positive: 0, negative: 0, score: 0 },
    topics: [],
    challenges: [],
    successes: [],
    actionItems: [],
    studentMentions: 0,
    wordCount: 0,
};

const activity = {
    _id: 'sess-1',
    teacher: { _id: 'teach-1', email: 't@example.com' },
    subject: { name: 'Science' },
    classroom: { name: 'JSS2', level: 'JSS' },
    durationInMinutes: 40,
    topic: 'Photosynthesis',
    feedbackNote: 'Sample note',
};

describe('AIPedagogicalCoach helper coverage (extra)', () => {
    describe('analyzeSentiment', () => {
        test('labels positive when positive > negative', () => {
            const res = coach.analyzeSentiment('Excellent lesson, students were engaged and improved a lot');
            expect(res.label).toBe('positive');
            expect(res.positive).toBeGreaterThan(0);
        });
        test('labels negative when negative > positive', () => {
            const res = coach.analyzeSentiment('Students struggled and were disengaged, it was difficult and confusing');
            expect(res.label).toBe('negative');
            expect(res.negative).toBeGreaterThan(0);
        });
        test('labels neutral when no keywords', () => {
            const res = coach.analyzeSentiment('We discussed topics and took notes.');
            expect(res.label).toBe('neutral');
        });
    });

    describe('extractors', () => {
        test('extractTopics finds multiple topics', () => {
            const topics = coach.extractTopics('Students were engaged but confused about assessment details and behavior issues');
            expect(topics).toEqual(expect.arrayContaining(['engagement', 'understanding', 'behavior', 'assessment']));
        });
        test('identifyChallenges matches different patterns', () => {
            const text = 'They struggled with fractions. Time management was challenging. We had difficulty with transitions.';
            const challenges = coach.identifyChallenges(text);
            expect(challenges.join(' ')).toMatch(/fractions/i);
            expect(challenges.join(' ')).toMatch(/Time management/i);
            expect(challenges.join(' ')).toMatch(/transitions/i);
        });
        test('identifySuccesses matches patterns', () => {
            const text = 'Students understood decimals. Group work went well. They were successful in problem solving.';
            const successes = coach.identifySuccesses(text);
            expect(successes.join(' ')).toMatch(/decimals/i);
            expect(successes.join(' ')).toMatch(/Group work/i);
            expect(successes.join(' ')).toMatch(/problem solving/i);
        });
        test('countStudentMentions sums different phrases', () => {
            const text = 'Most students participated. The class was active. 12 students finished early.';
            expect(coach.countStudentMentions(text)).toBeGreaterThanOrEqual(3);
        });
        test('extractActionItems finds will/next/follow up patterns', () => {
            const text = 'Next class, review fractions. We will practice more. Need to follow up transitions.';
            const items = coach.extractActionItems(text);
            expect(items.join(' ')).toMatch(/review fractions/i);
            expect(items.join(' ')).toMatch(/practice more/i);
            expect(items.join(' ')).toMatch(/transitions/i);
        });
    });

    describe('defaults generators', () => {
        test('generateDefaultStrengths covers multiple branches', () => {
            const analysis = {
                ...baseAnalysis,
                sentiment: { label: 'positive', positive: 2, negative: 0, score: 0.6 },
                successes: ['group work'],
                actionItems: ['try exit tickets'],
                studentMentions: 4,
            };
            const strengths = coach.generateDefaultStrengths(analysis);
            expect(strengths.length).toBeGreaterThanOrEqual(3);
        });
        test('generateDefaultStrengths fallback when none found', () => {
            const strengths = coach.generateDefaultStrengths(baseAnalysis);
            expect(strengths.length).toBeGreaterThan(0);
        });
        test('generateDefaultGrowthAreas multiple reasons', () => {
            const analysis = {
                ...baseAnalysis,
                sentiment: { label: 'negative', positive: 0, negative: 3, score: -0.7 },
                challenges: ['a', 'b', 'c'],
                studentMentions: 0,
                actionItems: [],
            };
            const areas = coach.generateDefaultGrowthAreas(analysis);
            expect(areas.length).toBeGreaterThanOrEqual(3);
        });
        test('generateDefaultGrowthAreas fallback', () => {
            const areas = coach.generateDefaultGrowthAreas(baseAnalysis);
            expect(areas.length).toBeGreaterThan(0);
        });
        test('generateDefaultSuggestions specific challenge routing', () => {
            const a1 = { ...baseAnalysis, challenges: ['engagement issues'] };
            const a2 = { ...baseAnalysis, challenges: ['understanding algebra'] };
            const a3 = { ...baseAnalysis, challenges: ['time pressure'] };
            expect(coach.generateDefaultSuggestions(a1).join(' ')).toMatch(/Think-Pair-Share/i);
            expect(coach.generateDefaultSuggestions(a2).join(' ')).toMatch(/concept mapping/i);
            expect(coach.generateDefaultSuggestions(a3).join(' ')).toMatch(/timer/i);
        });
    });

    describe('resources + misc', () => {
        test('selectRelevantResources by topics and challenges', () => {
            const analysis = { ...baseAnalysis, topics: ['engagement', 'assessment'], challenges: ['difficult topic'] };
            const selected = coach.selectRelevantResources(analysis, null);
            // Should include up to 4 from topics (2 each) + 1 differentiation due to challenges
            expect(selected.length).toBeGreaterThanOrEqual(3);
            expect(selected.length).toBeLessThanOrEqual(5);
        });
        test('calculateCheckInDate ~ 7 days ahead', () => {
            const now = Date.now();
            const check = coach.calculateCheckInDate().getTime();
            const diffDays = Math.round((check - now) / (24 * 60 * 60 * 1000));
            expect(diffDays).toBeGreaterThanOrEqual(6);
            expect(diffDays).toBeLessThanOrEqual(8);
        });
        test('determinePriority low/medium branches', () => {
            expect(coach.determinePriority({ ...baseAnalysis, challenges: [], sentiment: { score: 0.1 } })).toBe('low');
            expect(coach.determinePriority({ ...baseAnalysis, challenges: ['x'], sentiment: { score: -0.1 } })).toBe('medium');
        });
        test('estimateEngagement none -> moderate; with engagement + positive -> high; negative -> low', () => {
            expect(coach.estimateEngagement({ ...baseAnalysis, topics: ['assessment'], sentiment: { score: 0 } })).toBe('moderate');
            expect(coach.estimateEngagement({ ...baseAnalysis, topics: ['engagement'], sentiment: { score: 0.2 } })).toBe('high');
            expect(coach.estimateEngagement({ ...baseAnalysis, topics: ['engagement'], sentiment: { score: -0.2 } })).toBe('low');
        });
        test('assessReflectionQuality accumulates points and caps at 100', () => {
            const a = {
                wordCount: 210,
                studentMentions: 3,
                challenges: ['x'],
                successes: ['y'],
                actionItems: ['z'],
            };
            const score = coach.assessReflectionQuality(a);
            expect(score).toBeGreaterThanOrEqual(25); // base for 100+ words
            expect(score).toBeLessThanOrEqual(100);
        });
        test('formatNotificationMessage branches by score', () => {
            const fbHigh = coach.generateStructuredFeedback(activity, { ...baseAnalysis, sentiment: { label: 'positive', score: 1 }, successes: ['x'], actionItems: ['y'] }, { strengths: ['S1'], growthAreas: [], suggestions: ['Do'], resources: [] });
            fbHigh.summary.overallScore = 85;
            const msgHigh = coach.formatNotificationMessage(fbHigh);
            expect(msgHigh).toMatch(/Excellent session/);

            const fbMid = { ...fbHigh, summary: { ...fbHigh.summary, overallScore: 65 } };
            const msgMid = coach.formatNotificationMessage(fbMid);
            expect(msgMid).toMatch(/Good session/);

            const fbLow = { ...fbHigh, summary: { ...fbHigh.summary, overallScore: 40 }, strengths: [], suggestions: [] };
            const msgLow = coach.formatNotificationMessage(fbLow);
            expect(msgLow).toMatch(/Growth opportunity/);
            expect(msgLow).toContain('Science');
            expect(msgLow).toContain('Photosynthesis');
        });
    });
});
