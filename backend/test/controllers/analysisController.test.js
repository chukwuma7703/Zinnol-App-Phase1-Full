// Mocked unit-level tests for analysis controller (no real DB I/O)
import User from '../../models/userModel.js';
import School from '../../models/School.js';
import Student from '../../models/Student.js';
import { getGlobalOverviewAnalytics, getSystemWideAnalytics, getStudentAnalytics, getTeacherAnalytics, getSchoolDashboardAnalytics, queryStudents, getClassroomLeaderboard, getDecliningStudents, createShareableLink, getTeacherActivityAnalytics, getTimetableCompliance } from '../../controllers/analysisController.js';
import mongoose from 'mongoose';
import Result from '../../models/Result.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Helpers
const mkReq = (overrides = {}) => ({ user: { _id: 'admin1', role: 'super_admin', school: 'school1' }, params: {}, query: {}, body: {}, ...overrides });
const mkRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() });
const mkNextWithCapture = () => {
  const fn = vi.fn();
  fn.getFirstCallArg = () => (fn.mock.calls[0] ? fn.mock.calls[0][0] : undefined);
  return fn;
};

describe('Analysis Controller (Mocked Unit)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getGlobalOverview returns counts', async () => {
    vi.spyOn(School, 'countDocuments').mockResolvedValue(3);
    vi.spyOn(User, 'countDocuments').mockResolvedValue(10);
    const req = mkReq();
    const res = mkRes();
    await getGlobalOverviewAnalytics(req, res, () => { });
    expect(res.json).toHaveBeenCalled();
  });

  it('getSystemWideAnalytics requires session', async () => {
    const req = mkReq({ query: {} });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getSystemWideAnalytics(req, res, next);
    const err = next.getFirstCallArg();
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
  });

  it('getStudentAnalytics invalid id', async () => {
    const req = mkReq({ params: { studentId: 'bad' }, query: { session: '2024/2025' } });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getStudentAnalytics(req, res, next);
    const err = next.getFirstCallArg();
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
  });

  it('getTeacherAnalytics requires session', async () => {
    const req = mkReq({ params: { teacherId: '507f1f77bcf86cd799439011' } });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getTeacherAnalytics(req, res, next);
    const err = next.getFirstCallArg();
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
  });

  it('getSchoolDashboard requires params', async () => {
    const req = mkReq({ query: {} });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getSchoolDashboardAnalytics(req, res, next);
    const err = next.getFirstCallArg();
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(400);
  });

  it('queryStudents basic', async () => {
    // Provide all required body fields & mock aggregate pipeline dependencies
    const req = mkReq({ body: { schoolId: '507f1f77bcf86cd799439011', session: '2024/2025', term: 1, filters: [], subjectFilters: [] } });
    const res = mkRes();
    vi.spyOn(Result, 'aggregate').mockReturnValue({ read: () => Promise.resolve([]) });
    // Mock mongoose.model to return stub for Subject only
    const originalModel = mongoose.model;
    vi.spyOn(mongoose, 'model').mockImplementation((name) => {
      if (name === 'Subject') {
        return { find: () => ({ select: () => ({ lean: () => ({ read: () => Promise.resolve([]) }) }) }) };
      }
      return originalModel.call(mongoose, name);
    });
    await queryStudents(req, res, (e) => { if (e) throw e; });
    expect(res.json).toHaveBeenCalled();
  });

  it('getClassroomLeaderboard validates params', async () => {
    const req = mkReq({ query: {} });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getClassroomLeaderboard(req, res, next);
    expect(next.getFirstCallArg().statusCode).toBe(400);
  });

  it('getDecliningStudents requires schoolId/session', async () => {
    const req = mkReq({ query: {} });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getDecliningStudents(req, res, next);
    expect(next.getFirstCallArg().statusCode).toBe(400);
  });

  it('createAnalyticsShareLink invalid type', async () => {
    const req = mkReq({ body: { type: 'bad', targetId: '1' } });
    const res = mkRes();
    const next = mkNextWithCapture();
    await createShareableLink(req, res, next);
    expect(next.getFirstCallArg().statusCode).toBe(400);
  });

  it('getTeacherActivityAnalytics needs date range', async () => {
    const req = mkReq({ query: { schoolId: 'school1' } });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getTeacherActivityAnalytics(req, res, next);
    expect(next.getFirstCallArg().statusCode).toBe(400);
  });

  it('getTimetableCompliance needs date range', async () => {
    const req = mkReq({ query: { schoolId: 'school1' } });
    const res = mkRes();
    const next = mkNextWithCapture();
    await getTimetableCompliance(req, res, next);
    expect(next.getFirstCallArg().statusCode).toBe(400);
  });
});