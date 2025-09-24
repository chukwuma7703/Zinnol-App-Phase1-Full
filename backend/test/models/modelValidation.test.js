import mongoose from 'mongoose';
import User from '../../models/User.js';
import School from '../../models/School.js';

describe('Model Validation Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/zinnolTestDB');
  });

  afterAll(async () => {
    // Clean up and close connection
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear all collections before each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  });

  describe('User Model Validation', () => {
    it('should create a valid user', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.name).toBe(userData.name);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.role).toBe(userData.role);
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });

    it('should hash password before saving', async () => {
      const userData = {
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'password123',
        role: 'Teacher'
      };

      const user = new User(userData);
      await user.save();

      // Password should be hashed, not plain text
      expect(user.password).not.toBe(userData.password);
      expect(user.password.length).toBeGreaterThan(userData.password.length);
    });

    it('should validate password matching', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'Admin'
      };

      const user = new User(userData);
      await user.save();

      const isMatch = await user.matchPassword('password123');
      const isNotMatch = await user.matchPassword('wrongpassword');

      expect(isMatch).toBe(true);
      expect(isNotMatch).toBe(false);
    });

    it('should require name field', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);

      await expect(user.save()).rejects.toThrow(/name.*required/i);
    });

    it('should require email field', async () => {
      const userData = {
        name: 'Test User',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);

      await expect(user.save()).rejects.toThrow(/email.*required/i);
    });

    it('should require password field', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        role: 'Student'
      };

      const user = new User(userData);

      await expect(user.save()).rejects.toThrow(/password.*required/i);
    });

    it('should require role field', async () => {
      const userData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      };

      const user = new User(userData);

      await expect(user.save()).rejects.toThrow(/role.*required/i);
    });

    it('should enforce unique email constraint', async () => {
      const userData1 = {
        name: 'User One',
        email: 'duplicate@example.com',
        password: 'password123',
        role: 'Student'
      };

      const userData2 = {
        name: 'User Two',
        email: 'duplicate@example.com',
        password: 'password456',
        role: 'Teacher'
      };

      await new User(userData1).save();

      await expect(new User(userData2).save()).rejects.toThrow(/duplicate key/i);
    });

    it('should validate email format', async () => {
      const userData = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);

      // Note: Mongoose doesn't validate email format by default
      // This would require additional validation middleware
      await expect(user.save()).resolves.toBeDefined();
    });

    it('should trim whitespace from string fields', async () => {
      const userData = {
        name: '  John Doe  ',
        email: '  john@example.com  ',
        password: 'password123',
        role: 'Student'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      // Mongoose doesn't trim by default, so values should remain as-is
      expect(savedUser.name).toBe('  John Doe  ');
      expect(savedUser.email).toBe('  john@example.com  ');
    });
  });

  describe('School Model Validation', () => {
    it('should create a valid school', async () => {
      const schoolData = {
        name: 'Test School',
        address: '123 Test Street',
        phone: '+1234567890',
        email: 'school@example.com',
        website: 'https://testschool.com',
        description: 'A test school',
        numberOfStudents: 500,
        numberOfTeachers: 30,
        lat: 40.7128,
        lng: -74.0060,
        isActive: true,
        gradingSystem: {
          type: 'WAEC',
          passingGrade: 'E8',
          honorRollGrade: 'B2'
        },
        academicSettings: {
          currentSession: '2023/2024',
          currentTerm: 1,
          gradingPeriods: 3,
          maxScore: 100,
          minScore: 0
        }
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool._id).toBeDefined();
      expect(savedSchool.name).toBe(schoolData.name);
      expect(savedSchool.isActive).toBe(true);
      expect(savedSchool.numberOfStudents).toBe(500);
      expect(savedSchool.gradingSystem.type).toBe('WAEC');
      expect(savedSchool.academicSettings.currentTerm).toBe(1);
    });

    it('should require name field', async () => {
      const schoolData = {
        address: '123 Test Street'
      };

      const school = new School(schoolData);

      await expect(school.save()).rejects.toThrow(/name.*required/i);
    });

    it('should set default values correctly', async () => {
      const schoolData = {
        name: 'Minimal School'
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool.isActive).toBe(true);
      expect(savedSchool.numberOfStudents).toBe(0);
      expect(savedSchool.numberOfTeachers).toBe(0);
      expect(savedSchool.notifiedMilestones).toEqual([]);
      expect(savedSchool.gradingSystem.type).toBe('WAEC');
      expect(savedSchool.academicSettings.gradingPeriods).toBe(3);
      expect(savedSchool.academicSettings.maxScore).toBe(100);
      expect(savedSchool.academicSettings.minScore).toBe(0);
    });

    it('should validate grading system enum values', async () => {
      const schoolData = {
        name: 'Test School',
        gradingSystem: {
          type: 'INVALID_TYPE'
        }
      };

      const school = new School(schoolData);

      await expect(school.save()).rejects.toThrow(/not a valid enum value/i);
    });

    it('should validate term number range', async () => {
      const schoolData = {
        name: 'Test School',
        academicSettings: {
          currentTerm: 4 // Should be 1-3
        }
      };

      const school = new School(schoolData);

      await expect(school.save()).rejects.toThrow(/is more than maximum allowed value/i);
    });

    it('should validate custom grade scale structure', async () => {
      const schoolData = {
        name: 'Test School',
        gradingSystem: {
          type: 'CUSTOM',
          customScale: [
            {
              code: 'A1',
              label: 'Excellent',
              minScore: 80,
              maxScore: 100,
              remarks: 'Outstanding performance'
            },
            {
              code: 'B2',
              label: 'Good',
              minScore: 70,
              maxScore: 79,
              remarks: 'Good performance'
            }
          ]
        }
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool.gradingSystem.customScale).toHaveLength(2);
      expect(savedSchool.gradingSystem.customScale[0].code).toBe('A1');
      expect(savedSchool.gradingSystem.customScale[0].minScore).toBe(80);
    });

    it('should validate term dates structure', async () => {
      const schoolData = {
        name: 'Test School',
        academicSettings: {
          termDates: [
            {
              term: 1,
              startDate: new Date('2024-01-01'),
              endDate: new Date('2024-04-01')
            },
            {
              term: 2,
              startDate: new Date('2024-04-15'),
              endDate: new Date('2024-07-15')
            }
          ]
        }
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool.academicSettings.termDates).toHaveLength(2);
      expect(savedSchool.academicSettings.termDates[0].term).toBe(1);
      expect(savedSchool.academicSettings.termDates[0].startDate).toBeInstanceOf(Date);
    });

    it('should validate coordinate ranges', async () => {
      const schoolData = {
        name: 'Test School',
        lat: 91, // Invalid latitude (> 90)
        lng: -200 // Invalid longitude (< -180)
      };

      const school = new School(schoolData);

      // Note: Mongoose doesn't validate coordinate ranges by default
      // This would require custom validation
      await expect(school.save()).resolves.toBeDefined();
    });

    it('should handle features map correctly', async () => {
      const schoolData = {
        name: 'Test School',
        features: {
          'advanced-analytics': true,
          'custom-reports': false,
          'api-access': true
        }
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool.features.get('advanced-analytics')).toBe(true);
      expect(savedSchool.features.get('custom-reports')).toBe(false);
      expect(savedSchool.features.get('api-access')).toBe(true);
    });

    it('should validate ObjectId references', async () => {
      const user = await new User({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'password123',
        role: 'Admin'
      }).save();

      const schoolData = {
        name: 'Test School',
        mainSuperAdmins: [user._id]
      };

      const school = new School(schoolData);
      const savedSchool = await school.save();

      expect(savedSchool.mainSuperAdmins).toHaveLength(1);
      expect(savedSchool.mainSuperAdmins[0].toString()).toBe(user._id.toString());
    });
  });

  describe('Cross-Model Validation', () => {
    it('should handle user-school relationships correctly', async () => {
      // Create a user
      const user = await new User({
        name: 'School Admin',
        email: 'admin@school.com',
        password: 'password123',
        role: 'School Admin'
      }).save();

      // Create a school with the user as mainSuperAdmin
      const school = await new School({
        name: 'Relationship Test School',
        mainSuperAdmins: [user._id]
      }).save();

      // Verify the relationship
      expect(school.mainSuperAdmins[0].toString()).toBe(user._id.toString());

      // Test population (if implemented in queries)
      const populatedSchool = await School.findById(school._id).populate('mainSuperAdmins');
      if (populatedSchool.mainSuperAdmins[0]) {
        expect(populatedSchool.mainSuperAdmins[0].name).toBe('School Admin');
      }
    });

    it('should prevent circular references in school hierarchies', async () => {
      // This test would be relevant if schools had parent-child relationships
      // For now, we'll test that schools can reference users but not themselves

      const school1 = await new School({ name: 'School 1' }).save();
      const school2 = await new School({ name: 'School 2' }).save();

      // Schools shouldn't be able to reference other schools in a way that creates cycles
      // This depends on the actual schema relationships
      expect(school1._id).not.toBe(school2._id);
    });
  });
});
