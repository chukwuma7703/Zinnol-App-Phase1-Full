import { vi } from 'vitest';
import coach from '../../../services/aiPedagogicalCoach.js';

vi.mock('../../../models/Notification.js', () => ({ __esModule: true, default: function Notification(doc) { this.save = vi.fn().mockResolvedValue({ _id: 'n1', ...doc }); return this; } }));
vi.mock('../../../models/teacherActivityModel.js', () => ({ __esModule: true, default: { find: vi.fn(() => ({ sort: vi.fn(() => ({ limit: vi.fn(() => ({ select: vi.fn(() => ([{ _id: 'a1', coachingGeneratedAt: new Date('2025-01-01'), topic: 'T', subject: 'Math', aiCoachingFeedback: { summary: { overallScore: 80 } } }])) })) })) })), aggregate: vi.fn().mockResolvedValue([{ totalSessions: 5, avgScore: 70, avgEngagement: 2, totalChallenges: 10, totalSuccesses: 12 }]) } }));

function makeFeedback(priority = 'high') {
    return {
        sessionId: 'sess1',
        summary: { subject: 'Math', topic: 'Fractions', overallScore: priority === 'high' ? 85 : (priority === 'medium' ? 65 : 50) },
        strengths: ['Great pacing'],
        suggestions: ['Try exit tickets'],
        resources: [{ title: 'R1' }, { title: 'R2' }],
        followUp: { priority },
    };
}

describe('AIPedagogicalCoach more coverage', () => {
    test('notifyTeacher triggers email when high priority', async () => {
        const spy = vi.spyOn(coach, 'sendEmailNotification').mockResolvedValue();
        const teacher = { _id: 't1', email: 't@example.com' };
        const feedback = makeFeedback('high');

        await coach.notifyTeacher(teacher, feedback);

        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('formatNotificationMessage priority branches', () => {
        const hi = makeFeedback('high');
        const med = makeFeedback('medium');
        const low = makeFeedback('low');
        expect(coach.formatNotificationMessage(hi)).toContain('Excellent');
        expect(coach.formatNotificationMessage(med)).toContain('Good');
        expect(coach.formatNotificationMessage(low)).toContain('Growth');
    });

    test('getCoachingHistory maps activities', async () => {
        const items = await coach.getCoachingHistory('t1', 1);
        expect(Array.isArray(items)).toBe(true);
        expect(items[0]).toHaveProperty('id');
    });

    test('getSchoolCoachingAnalytics returns aggregation result or default', async () => {
        const analytics = await coach.getSchoolCoachingAnalytics('sch1');
        expect(analytics).toHaveProperty('totalSessions');
    });
});
