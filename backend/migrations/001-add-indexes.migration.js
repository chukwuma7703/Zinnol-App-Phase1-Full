import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Migration to add essential database indexes
 */
export const up = async () => {
  const db = mongoose.connection.db;

  // Helper: create indexes only when not already present with same key
  const ensureIndexes = async (collectionName, indexSpecs) => {
    const coll = db.collection(collectionName);
    let existing = [];
    try {
      existing = await coll.indexes();
    } catch (_) {
      // Collection may not exist yet; proceed to create indexes when first created
    }

    const keysEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    const specsToCreate = [];
    for (const spec of indexSpecs) {
      const already = existing.find(idx => keysEqual(idx.key, spec.key));
      if (already) {
        // If an index with same key exists but options differ, skip to avoid conflict
        // (admins can reconcile manually if needed). This keeps migration idempotent.
        continue;
      }
      specsToCreate.push(spec);
    }

    if (specsToCreate.length > 0) {
      try {
        await coll.createIndexes(specsToCreate);
      } catch (err) {
        // Ignore conflicts (code 85/86) to keep migration re-runnable safely
        if (err?.code !== 85 && err?.code !== 86) throw err;
      }
    }
  };

  // User indexes
  await ensureIndexes('users', [
    { key: { email: 1 }, unique: true, background: true },
    { key: { role: 1 }, background: true },
    { key: { school: 1 }, background: true },
    { key: { isActive: 1 }, background: true },
    { key: { createdAt: -1 }, background: true },
  ]);
  logger.info('Created indexes for users collection');

  // Student indexes
  await ensureIndexes('students', [
    { key: { email: 1 }, unique: true, sparse: true, background: true },
    { key: { school: 1, class: 1 }, background: true },
    { key: { admissionNumber: 1, school: 1 }, unique: true, background: true },
    { key: { 'parent.email': 1 }, sparse: true, background: true },
  ]);
  logger.info('Created indexes for students collection');

  // Result indexes
  await ensureIndexes('results', [
    { key: { student: 1, session: 1, term: 1 }, background: true },
    { key: { school: 1, class: 1, session: 1, term: 1 }, background: true },
    { key: { createdAt: -1 }, background: true },
    { key: { 'subjects.name': 1 }, background: true },
  ]);
  logger.info('Created indexes for results collection');

  // School indexes
  await ensureIndexes('schools', [
    { key: { name: 1 }, unique: true, background: true },
    { key: { 'location.coordinates': '2dsphere' }, background: true },
    { key: { isActive: 1 }, background: true },
    { key: { type: 1 }, background: true },
  ]);
  logger.info('Created indexes for schools collection');

  // Exam indexes
  await ensureIndexes('exams', [
    { key: { school: 1, class: 1, subject: 1 }, background: true },
    { key: { startTime: 1, endTime: 1 }, background: true },
    { key: { status: 1 }, background: true },
    { key: { createdBy: 1 }, background: true },
  ]);
  logger.info('Created indexes for exams collection');

  // Notification indexes
  await ensureIndexes('notifications', [
    { key: { recipient: 1, read: 1 }, background: true },
    { key: { createdAt: -1 }, background: true },
    { key: { type: 1 }, background: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, background: true }, // TTL index
  ]);
  logger.info('Created indexes for notifications collection');

  // Session/Token indexes with TTL
  await ensureIndexes('refreshtokens', [
    { key: { user: 1 }, background: true },
    // Keep sparse true to match potential pre-existing schema index and avoid conflicts
    { key: { token: 1 }, unique: true, sparse: true, background: true },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, background: true }, // TTL index
  ]);
  logger.info('Created indexes for refreshtokens collection');

  // Audit log indexes
  await ensureIndexes('auditlogs', [
    { key: { user: 1, action: 1 }, background: true },
    { key: { createdAt: -1 }, background: true },
    { key: { resource: 1, resourceId: 1 }, background: true },
  ]);
  logger.info('Created indexes for auditlogs collection');
};

/**
 * Rollback migration
 */
export const down = async () => {
  const db = mongoose.connection.db;

  // Drop all custom indexes (keep _id index)
  const collections = [
    'users', 'students', 'results', 'schools',
    'exams', 'notifications', 'refreshtokens', 'auditlogs'
  ];

  for (const collection of collections) {
    try {
      const indexes = await db.collection(collection).indexes();
      for (const index of indexes) {
        if (index.name !== '_id_') {
          await db.collection(collection).dropIndex(index.name);
        }
      }
      logger.info(`Dropped indexes for ${collection} collection`);
    } catch (error) {
      logger.warn(`Collection ${collection} not found or no indexes to drop`);
    }
  }
};