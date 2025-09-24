import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration schema
const migrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  executedAt: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  error: String,
});

const Migration = mongoose.model('Migration', migrationSchema);

/**
 * Migration runner class
 */
class MigrationRunner {
  constructor() {
    this.migrations = [];
  }

  /**
   * Load all migration files
   */
  async loadMigrations() {
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.migration.js'))
      .sort(); // Ensure migrations run in order

    for (const file of files) {
      const migration = await import(path.join(migrationsDir, file));
      this.migrations.push({
        name: file,
        up: migration.up,
        down: migration.down,
      });
    }

    logger.info(`Loaded ${this.migrations.length} migrations`);
  }

  /**
   * Run pending migrations
   */
  async up() {
    await this.loadMigrations();

    for (const migration of this.migrations) {
      const existingMigration = await Migration.findOne({ name: migration.name });

      if (!existingMigration || existingMigration.status !== 'completed') {
        logger.info(`Running migration: ${migration.name}`);

        try {
          await migration.up();

          if (existingMigration) {
            existingMigration.status = 'completed';
            existingMigration.executedAt = new Date();
            await existingMigration.save();
          } else {
            await Migration.create({
              name: migration.name,
              status: 'completed',
            });
          }

          logger.info(`Migration completed: ${migration.name}`);
        } catch (error) {
          logger.error(`Migration failed: ${migration.name}`, error);

          if (existingMigration) {
            existingMigration.status = 'failed';
            existingMigration.error = error.message;
            await existingMigration.save();
          } else {
            await Migration.create({
              name: migration.name,
              status: 'failed',
              error: error.message,
            });
          }

          throw error;
        }
      } else {
        logger.info(`Migration already completed: ${migration.name}`);
      }
    }
  }

  /**
   * Rollback last migration
   */
  async down() {
    await this.loadMigrations();

    const lastMigration = await Migration.findOne({ status: 'completed' })
      .sort({ executedAt: -1 });

    if (!lastMigration) {
      logger.info('No migrations to rollback');
      return;
    }

    const migration = this.migrations.find(m => m.name === lastMigration.name);

    if (!migration) {
      logger.error(`Migration file not found: ${lastMigration.name}`);
      return;
    }

    logger.info(`Rolling back migration: ${migration.name}`);

    try {
      await migration.down();
      await Migration.deleteOne({ _id: lastMigration._id });
      logger.info(`Migration rolled back: ${migration.name}`);
    } catch (error) {
      logger.error(`Rollback failed: ${migration.name}`, error);
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async status() {
    await this.loadMigrations();

    const executedMigrations = await Migration.find().sort({ executedAt: 1 });
    const executedNames = executedMigrations.map(m => m.name);

    const status = this.migrations.map(migration => ({
      name: migration.name,
      status: executedNames.includes(migration.name) ? 'completed' : 'pending',
      executedAt: executedMigrations.find(m => m.name === migration.name)?.executedAt,
    }));

    return status;
  }

  /**
   * Reset all migrations (dangerous!)
   */
  async reset() {
    logger.warn('Resetting all migrations...');

    // Run down for all completed migrations in reverse order
    const completedMigrations = await Migration.find({ status: 'completed' })
      .sort({ executedAt: -1 });

    for (const completed of completedMigrations) {
      const migration = this.migrations.find(m => m.name === completed.name);
      if (migration && migration.down) {
        try {
          await migration.down();
          logger.info(`Rolled back: ${migration.name}`);
        } catch (error) {
          logger.error(`Failed to rollback: ${migration.name}`, error);
        }
      }
    }

    // Clear migration history
    await Migration.deleteMany({});
    logger.info('All migrations reset');
  }
}

export default MigrationRunner;

// CLI interface
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];

  (async () => {
    try {
      // Connect to database
      await mongoose.connect(process.env.MONGO_URI);
      logger.info('Connected to database');

      const runner = new MigrationRunner();

      switch (command) {
        case 'up': {
          await runner.up();
          break;
        }
        case 'down': {
          await runner.down();
          break;
        }
        case 'status': {
          const status = await runner.status();
          console.table(status);
          break;
        }
        case 'reset': {
          await runner.reset();
          break;
        }
        default: {
          console.log('Usage: node migrationRunner.js [up|down|status|reset]');
        }
      }

      await mongoose.connection.close();
      process.exit(0);
    } catch (error) {
      logger.error('Migration error', error);
      process.exit(1);
    }
  })();
}