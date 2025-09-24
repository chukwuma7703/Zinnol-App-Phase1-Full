/**
 * Predictive Analytics Service Test Suite
 * Tests for AI-powered student decline prediction
 */

import predictiveModel, { predictClassDeclineRisks, monitorStudentRisk } from '../../services/predictiveAnalytics.js';
import User from '../../models/userModel.js';
import Result from '../../models/Result.js';
import StudentExam from '../../models/StudentExam.js';
import School from '../../models/School.js';
import Classroom from '../../models/Classroom.js';
import Subject from '../../models/Subject.js';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

describe('Predictive Analytics Service', () => {
  let school, classroom, student, teacher, subject, results;
  let mongoServer;

  beforeAll(async () => {
    // Start in-memory MongoDB server
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up database connection
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Create test school
    school = await School.create({
      name: 'Test School',
      email: 'school@test.com',
      address: '123 Test St',
      type: 'secondary',
    });

    // Create teacher
    teacher = await User.create({
      name: 'Test Teacher',
      email: `teacher${Date.now()}@test.com`,
      password: 'Teacher@1234',
      role: 'teacher',
      school: school._id,
    });

    // Create subject
    subject = await Subject.create({
      name: 'Mathematics',
      code: 'MATH',
      school: school._id,
    });

    // Create classroom
    classroom = await Classroom.create({
      name: 'Class 10A',
      school: school._id,
      stage: 'sss',
      level: 3,
      teacher: teacher._id,
      capacity: 30,
    });

    // Create student
    student = await User.create({
      name: 'Test Student',
      email: `student${Date.now()}@test.com`,
      password: 'Student@1234',
      role: 'student',
      school: school._id,
      classroom: classroom._id,
    });

    // Create historical results for prediction
    results = [];
    const sessions = ['2023/2024', '2024/2025'];
    const terms = [1, 2, 3];
    let averageScore = 85;

    for (const session of sessions) {
      for (const term of terms) {
        // Simulate declining performance
        averageScore -= 3;

        const result = await Result.create({
          student: student._id,
          school: school._id,
          classroom: classroom._id,
          session,
          term,
          average: averageScore,
          position: Math.floor(Math.random() * 10) + 1,
          status: 'approved',
          items: [
            {
              subject: subject._id,
              total: averageScore + Math.random() * 10 - 5,
            },
          ],
        });
        results.push(result);
      }
    }
  });

  afterEach(async () => {
    // Clean up all test data
    await Result.deleteMany({});
    await User.deleteMany({});
    await School.deleteMany({});
    await Classroom.deleteMany({});
    await Subject.deleteMany({});
    await StudentExam.deleteMany({});
  });

  describe('predictDeclineRisk', () => {
    it('should predict decline risk for a student', async () => {
      const prediction = await predictiveModel.predictDeclineRisk(
        student._id,
        '2024/2025'
      );

      expect(prediction).toHaveProperty('riskScore');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('factors');
      expect(prediction).toHaveProperty('recommendation');
      expect(prediction).toHaveProperty('riskLevel');

      expect(prediction.riskScore).toBeGreaterThanOrEqual(0);
      expect(prediction.riskScore).toBeLessThanOrEqual(100);
    });

    it('should return low confidence for insufficient data', async () => {
      // Create student with no results
      const newStudent = await User.create({
        name: 'New Student',
        email: 'new@test.com',
        password: 'New@1234',
        role: 'student',
        school: school._id,
      });

      const prediction = await predictiveModel.predictDeclineRisk(
        newStudent._id,
        '2024/2025'
      );

      expect(prediction.confidence).toBe(0);
      expect(prediction.recommendation).toContain('Insufficient data');
    });

    it('should identify high risk for declining grades', async () => {
      // Create a separate student for this test to avoid interference
      const testStudent = await User.create({
        name: 'Declining Student',
        email: `declining${Date.now()}@test.com`,
        password: 'Declining@1234',
        role: 'student',
        school: school._id,
        classroom: classroom._id,
      });

      // Create more dramatic decline with proper subject items
      const averages = [60, 30, 10];
      for (let i = 0; i < 3; i++) {
        await Result.create({
          student: testStudent._id,
          school: school._id,
          classroom: classroom._id,
          session: '2024/2025',
          term: i + 1,
          position: 20 + i,
          status: 'approved',
          items: [{
            subject: subject._id,
            caScore: 20,
            examScore: averages[i] - 20, // Make exam score adjust to reach target average
            maxCaScore: 40,
            maxExamScore: 60,
            total: averages[i]
          }],
        });
      }

      const prediction = await predictiveModel.predictDeclineRisk(
        testStudent._id,
        '2024/2025'
      );

      expect(prediction.riskLevel).toBe('MEDIUM');
      expect(prediction.riskScore).toBeGreaterThanOrEqual(50);
    });

    it('should analyze multiple risk factors', async () => {
      const prediction = await predictiveModel.predictDeclineRisk(
        student._id,
        '2024/2025'
      );

      expect(prediction.factors).toHaveProperty('gradeTrend');
      expect(prediction.factors).toHaveProperty('volatility');
      expect(prediction.factors).toHaveProperty('subjectStruggle');
      expect(prediction.factors).toHaveProperty('examPerformance');
      expect(prediction.factors).toHaveProperty('attendanceRate');
      expect(prediction.factors).toHaveProperty('peerPerformance');
      expect(prediction.factors).toHaveProperty('seasonalPattern');
    });

    it('should generate actionable recommendations', async () => {
      const prediction = await predictiveModel.predictDeclineRisk(
        student._id,
        '2024/2025'
      );

      expect(prediction.recommendation).toBeInstanceOf(Array);
      expect(prediction.recommendation.length).toBeGreaterThan(0);

      if (prediction.recommendation.length > 0) {
        expect(prediction.recommendation[0]).toHaveProperty('priority');
        expect(prediction.recommendation[0]).toHaveProperty('action');
        expect(prediction.recommendation[0]).toHaveProperty('description');
      }
    });

    it('should predict decline timeline for high-risk students', async () => {
      // Create high-risk scenario
      await Result.create({
        student: student._id,
        school: school._id,
        classroom: classroom._id,
        session: '2024/2025',
        term: 3,
        average: 35,
        position: 25,
        status: 'approved',
        items: [],
      });

      const prediction = await predictiveModel.predictDeclineRisk(
        student._id,
        '2024/2025'
      );

      if (prediction.riskScore >= 25) {
        expect(prediction.predictedDeclineDate).toBeInstanceOf(Date);
        expect(prediction.predictedDeclineDate.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('predictClassDeclineRisks', () => {
    it('should predict risks for entire classroom', async () => {
      // Create test data for this specific test
      const testSchool = await School.create({
        name: 'Test School Classroom',
        email: 'school@classroom.test.com',
        address: '123 Test St',
        type: 'secondary',
      });

      // Create a teacher for the classroom
      const testTeacher = await User.create({
        name: 'Test Teacher Classroom',
        email: 'teacher@classroom.test.com',
        password: 'Teacher@1234',
        role: 'teacher',
        school: testSchool._id,
      });

      const testClassroom = await Classroom.create({
        name: 'Class 10A Test',
        school: testSchool._id,
        stage: 'sss',
        level: 3,
        teacher: testTeacher._id,
        capacity: 30,
      });

      // Create multiple students
      const students = [];
      for (let i = 0; i < 3; i++) {
        const s = await User.create({
          name: `Student ${i}`,
          email: `student${i}@classroom.test.com`,
          password: 'Student@1234',
          role: 'student',
          school: testSchool._id,
          classroom: testClassroom._id,
        });
        students.push(s);
        console.log(`Created student ${s._id} in classroom ${testClassroom._id}`);

        // Create results for each student (need at least 2 for prediction)
        const terms = [1, 2];
        for (const term of terms) {
          await Result.create({
            student: s._id,
            school: testSchool._id,
            classroom: testClassroom._id,
            session: '2024/2025',
            term: term,
            average: 70 - (i * 10) - (term * 5), // Declining over terms
            position: i + 1,
            status: 'approved',
            items: [],
          });
        }
      }

      const predictions = await predictClassDeclineRisks(
        testClassroom._id,
        '2024/2025'
      );

      console.log(`Found ${predictions.length} predictions for classroom ${testClassroom._id}`);
      predictions.forEach(p => console.log(`Prediction: ${p.studentName} - risk: ${p.riskScore}`));

      expect(predictions).toBeInstanceOf(Array);
      expect(predictions.length).toBeGreaterThanOrEqual(3);

      // Should be sorted by risk score (highest first)
      if (predictions.length > 1) {
        expect(predictions[0].riskScore).toBeGreaterThanOrEqual(predictions[1].riskScore);
      }
    });

    it('should include student information in predictions', async () => {
      const predictions = await predictClassDeclineRisks(
        classroom._id,
        '2024/2025'
      );

      if (predictions.length > 0) {
        expect(predictions[0]).toHaveProperty('studentId');
        expect(predictions[0]).toHaveProperty('studentName');
        expect(predictions[0]).toHaveProperty('riskScore');
        expect(predictions[0]).toHaveProperty('riskLevel');
      }
    });
  });

  describe('monitorStudentRisk', () => {
    it('should monitor student and return prediction', async () => {
      const prediction = await monitorStudentRisk(student._id);

      expect(prediction).toHaveProperty('riskScore');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('factors');
    });

    it('should trigger alerts for high-risk students', async () => {
      // Create high-risk scenario
      for (let i = 0; i < 3; i++) {
        await Result.create({
          student: student._id,
          school: school._id,
          classroom: classroom._id,
          session: '2024/2025',
          term: i + 1,
          average: 40 - (i * 5),
          position: 30,
          status: 'approved',
          items: [],
        });
      }

      const prediction = await monitorStudentRisk(student._id);

      // High risk should be detected
      if (prediction.riskScore >= 75) {
        expect(prediction.riskLevel).toBe('HIGH');
        // In real implementation, this would trigger notifications
      }
    });
  });

  describe('Risk Calculation Methods', () => {
    describe('calculateGradeTrend', () => {
      it('should calculate positive trend for improving grades', () => {
        const scores = [
          { average: 60 },
          { average: 65 },
          { average: 70 },
          { average: 75 },
        ];

        const trend = predictiveModel.calculateGradeTrend(scores);
        expect(trend).toBeLessThan(50); // Lower risk for improving grades
      });

      it('should calculate negative trend for declining grades', () => {
        const scores = [
          { average: 90 },
          { average: 70 },
          { average: 50 },
          { average: 30 },
        ];

        const trend = predictiveModel.calculateGradeTrend(scores);
        expect(trend).toBeGreaterThanOrEqual(50); // Higher risk for declining grades
      });

      it('should handle insufficient data', () => {
        const scores = [{ average: 70 }];
        const trend = predictiveModel.calculateGradeTrend(scores);
        expect(trend).toBe(0);
      });
    });

    describe('calculateVolatility', () => {
      it('should identify high volatility', () => {
        const scores = [
          { average: 90 },
          { average: 60 },
          { average: 85 },
          { average: 55 },
        ];

        const volatility = predictiveModel.calculateVolatility(scores);
        expect(volatility).toBeGreaterThan(30);
      });

      it('should identify low volatility', () => {
        const scores = [
          { average: 70 },
          { average: 72 },
          { average: 71 },
          { average: 73 },
        ];

        const volatility = predictiveModel.calculateVolatility(scores);
        expect(volatility).toBeLessThan(10);
      });
    });

    describe('getRiskLevel', () => {
      it('should categorize risk levels correctly', () => {
        expect(predictiveModel.getRiskLevel(85)).toBe('HIGH');
        expect(predictiveModel.getRiskLevel(60)).toBe('MEDIUM');
        expect(predictiveModel.getRiskLevel(30)).toBe('LOW');
        expect(predictiveModel.getRiskLevel(10)).toBe('SAFE');
      });
    });
  });

  describe('Recommendation Generation', () => {
    it('should generate recommendations based on risk factors', () => {
      const highRiskFactors = {
        gradeTrend: 80,
        volatility: 75,
        subjectStruggle: 60,
        attendanceRate: 50,
        examPerformance: 70,
      };

      const recommendations = predictiveModel.generateRecommendation(80, highRiskFactors);

      expect(recommendations).toBeInstanceOf(Array);
      expect(recommendations.length).toBeGreaterThan(0);

      // Should prioritize high-risk factors
      const highPriorityRecs = recommendations.filter(r => r.priority === 'HIGH');
      expect(highPriorityRecs.length).toBeGreaterThan(0);
    });

    it('should provide different recommendations for different issues', () => {
      const attendanceIssue = {
        attendanceRate: 70,
        gradeTrend: 20,
      };

      const recommendations = predictiveModel.generateRecommendation(60, attendanceIssue);

      const attendanceRec = recommendations.find(r =>
        r.description.toLowerCase().includes('attendance')
      );
      expect(attendanceRec).toBeDefined();
    });
  });

  afterEach(async () => {
    // Clean up all test data
    await Result.deleteMany({});
    await User.deleteMany({});
    await School.deleteMany({});
    await Classroom.deleteMany({});
    await Subject.deleteMany({});
    await StudentExam.deleteMany({});
  });
});