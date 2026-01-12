/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';

/**
 * Migration script definition
 */
export interface IMigration {
  version: number; // Target version after this migration
  name: string; // Migration name for logging
  up: (db: Database.Database) => void; // Upgrade script
  down: (db: Database.Database) => void; // Downgrade script (for rollback)
}

/**
 * Migration v0 -> v1: Initial schema
 * This is handled by initSchema() in schema.ts
 */
const migration_v1: IMigration = {
  version: 1,
  name: 'Initial schema',
  up: (_db) => {
    // Already handled by initSchema()
    console.log('[Migration v1] Initial schema created by initSchema()');
  },
  down: (db) => {
    // Drop all tables (only core tables now)
    db.exec(`
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS conversations;
      DROP TABLE IF EXISTS users;
    `);
    console.log('[Migration v1] Rolled back: All tables dropped');
  },
};

/**
 * Migration v1 -> v2: Add indexes for better performance
 * Example of a schema change migration
 */
const migration_v2: IMigration = {
  version: 2,
  name: 'Add performance indexes',
  up: (db) => {
    db.exec(`
      -- Add composite index for conversation messages lookup
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
        ON messages(conversation_id, created_at DESC);

      -- Add index for message search by type
      CREATE INDEX IF NOT EXISTS idx_messages_type_created
        ON messages(type, created_at DESC);

      -- Add index for user conversations lookup
      CREATE INDEX IF NOT EXISTS idx_conversations_user_type
        ON conversations(user_id, type);
    `);
    console.log('[Migration v2] Added performance indexes');
  },
  down: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS idx_messages_conv_created_desc;
      DROP INDEX IF EXISTS idx_messages_type_created;
      DROP INDEX IF EXISTS idx_conversations_user_type;
    `);
    console.log('[Migration v2] Rolled back: Removed performance indexes');
  },
};

/**
 * Migration v2 -> v3: Add full-text search support [REMOVED]
 *
 * Note: FTS functionality has been removed as it's not currently needed.
 * Will be re-implemented when search functionality is added to the UI.
 */
const migration_v3: IMigration = {
  version: 3,
  name: 'Add full-text search (skipped)',
  up: (_db) => {
    // FTS removed - will be re-added when search functionality is implemented
    console.log('[Migration v3] FTS support skipped (removed, will be added back later)');
  },
  down: (db) => {
    // Clean up FTS table if it exists from older versions
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
    `);
    console.log('[Migration v3] Rolled back: Removed full-text search');
  },
};

/**
 * Migration v3 -> v4: Removed (user_preferences table no longer needed)
 */
const migration_v4: IMigration = {
  version: 4,
  name: 'Removed user_preferences table',
  up: (_db) => {
    // user_preferences table removed from schema
    console.log('[Migration v4] Skipped (user_preferences table removed)');
  },
  down: (_db) => {
    console.log('[Migration v4] Rolled back: No-op (user_preferences table removed)');
  },
};

/**
 * Migration v4 -> v5: Remove FTS table
 * Cleanup for FTS removal - ensures all databases have consistent schema
 */
const migration_v5: IMigration = {
  version: 5,
  name: 'Remove FTS table',
  up: (db) => {
    // Remove FTS table created by old v3 migration
    db.exec(`
      DROP TABLE IF EXISTS messages_fts;
    `);
    console.log('[Migration v5] Removed FTS table (cleanup for FTS removal)');
  },
  down: (_db) => {
    // If rolling back, we don't recreate FTS table (it's deprecated)
    console.log('[Migration v5] Rolled back: FTS table remains removed (deprecated feature)');
  },
};

/**
 * Migration v5 -> v6: Add jwt_secret column to users table
 * Store JWT secret per user for better security and management
 */
const migration_v6: IMigration = {
  version: 6,
  name: 'Add jwt_secret to users table',
  up: (db) => {
    // Check if jwt_secret column already exists
    const tableInfo = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasJwtSecret = tableInfo.some((col) => col.name === 'jwt_secret');

    if (!hasJwtSecret) {
      // Add jwt_secret column to users table
      db.exec(`ALTER TABLE users ADD COLUMN jwt_secret TEXT;`);
      console.log('[Migration v6] Added jwt_secret column to users table');
    } else {
      console.log('[Migration v6] jwt_secret column already exists, skipping');
    }
  },
  down: (db) => {
    // SQLite doesn't support DROP COLUMN directly, need to recreate table
    db.exec(`
      CREATE TABLE users_backup AS SELECT id, username, email, password_hash, avatar_path, created_at, updated_at, last_login FROM users;
      DROP TABLE users;
      ALTER TABLE users_backup RENAME TO users;
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('[Migration v6] Rolled back: Removed jwt_secret column from users table');
  },
};

/**
 * Migration v6 -> v7: Add order_key to messages table
 * Provide stable ordering independent of timestamps
 */
const migration_v7: IMigration = {
  version: 7,
  name: 'Add order_key to messages',
  up: (db) => {
    const tableInfo = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
    const hasOrderKey = tableInfo.some((col) => col.name === 'order_key');

    if (!hasOrderKey) {
      db.exec(`ALTER TABLE messages ADD COLUMN order_key INTEGER;`);
      console.log('[Migration v7] Added order_key column to messages table');
    } else {
      console.log('[Migration v7] order_key column already exists, skipping');
    }

    const rows = db
      .prepare(
        `
          SELECT id, conversation_id
          FROM messages
          ORDER BY conversation_id, created_at, rowid
        `
      )
      .all() as Array<{ id: string; conversation_id: string }>;

    const updateStmt = db.prepare('UPDATE messages SET order_key = ? WHERE id = ?');
    let currentConversation = '';
    let counter = 0;

    for (const row of rows) {
      if (row.conversation_id !== currentConversation) {
        currentConversation = row.conversation_id;
        counter = 0;
      }
      counter += 1;
      updateStmt.run(counter, row.id);
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_order_key ON messages(order_key);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_order ON messages(conversation_id, order_key);
    `);
    console.log('[Migration v7] Backfilled order_key and added indexes');
  },
  down: (db) => {
    db.exec(`
      CREATE TABLE messages_backup AS
      SELECT id, conversation_id, msg_id, type, content, position, status, created_at
      FROM messages;

      DROP TABLE messages;

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        msg_id TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
        status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
        created_at INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at)
      SELECT id, conversation_id, msg_id, type, content, position, status, created_at
      FROM messages_backup;

      DROP TABLE messages_backup;

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
      CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at DESC);
    `);
    console.log('[Migration v7] Rolled back: Removed order_key column from messages table');
  },
};

/**
 * Migration v7 -> v8: Add history_index to messages table
 * Persist backend history index for edit/regenerate alignment
 */
const migration_v8: IMigration = {
  version: 8,
  name: 'Add history_index to messages',
  up: (db) => {
    const tableInfo = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
    const hasHistoryIndex = tableInfo.some((col) => col.name === 'history_index');

    if (!hasHistoryIndex) {
      db.exec(`ALTER TABLE messages ADD COLUMN history_index INTEGER;`);
      console.log('[Migration v8] Added history_index column to messages table');
    } else {
      console.log('[Migration v8] history_index column already exists, skipping');
    }

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_history_index ON messages(history_index);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_history ON messages(conversation_id, history_index);
    `);
    console.log('[Migration v8] Added history_index indexes');
  },
  down: (db) => {
    db.exec(`
      CREATE TABLE messages_backup AS
      SELECT id, conversation_id, msg_id, type, content, position, status, created_at, order_key
      FROM messages;

      DROP TABLE messages;

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        msg_id TEXT,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
        status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
        created_at INTEGER NOT NULL,
        order_key INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      INSERT INTO messages (id, conversation_id, msg_id, type, content, position, status, created_at, order_key)
      SELECT id, conversation_id, msg_id, type, content, position, status, created_at, order_key
      FROM messages_backup;

      DROP TABLE messages_backup;

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
      CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_order_key ON messages(order_key);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_order ON messages(conversation_id, order_key);
    `);
    console.log('[Migration v8] Rolled back: Removed history_index column from messages table');
  },
};

/**
 * All migrations in order
 */
export const ALL_MIGRATIONS: IMigration[] = [migration_v1, migration_v2, migration_v3, migration_v4, migration_v5, migration_v6, migration_v7, migration_v8];

/**
 * Get migrations needed to upgrade from one version to another
 */
export function getMigrationsToRun(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > fromVersion && m.version <= toVersion).sort((a, b) => a.version - b.version);
}

/**
 * Get migrations needed to downgrade from one version to another
 */
export function getMigrationsToRollback(fromVersion: number, toVersion: number): IMigration[] {
  return ALL_MIGRATIONS.filter((m) => m.version > toVersion && m.version <= fromVersion).sort((a, b) => b.version - a.version);
}

/**
 * Run migrations in a transaction
 */
export function runMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  if (fromVersion === toVersion) {
    console.log('[Migrations] Already at target version');
    return;
  }

  if (fromVersion > toVersion) {
    throw new Error(`[Migrations] Downgrade not supported in production. Use rollbackMigration() for testing only.`);
  }

  const migrations = getMigrationsToRun(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No migrations needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Running ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);

  // Run all migrations in a single transaction
  const runAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Running migration v${migration.version}: ${migration.name}`);
        migration.up(db);

        console.log(`[Migrations] ✓ Migration v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Migration v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    runAll();
    console.log(`[Migrations] All migrations completed successfully`);
  } catch (error) {
    console.error('[Migrations] Migration failed, all changes rolled back:', error);
    throw error;
  }
}

/**
 * Rollback migrations (for testing/emergency use)
 * WARNING: This can cause data loss!
 */
export function rollbackMigrations(db: Database.Database, fromVersion: number, toVersion: number): void {
  if (fromVersion <= toVersion) {
    throw new Error('[Migrations] Cannot rollback to a higher or equal version');
  }

  const migrations = getMigrationsToRollback(fromVersion, toVersion);

  if (migrations.length === 0) {
    console.log(`[Migrations] No rollback needed from v${fromVersion} to v${toVersion}`);
    return;
  }

  console.log(`[Migrations] Rolling back ${migrations.length} migrations from v${fromVersion} to v${toVersion}`);
  console.warn('[Migrations] WARNING: This may cause data loss!');

  // Run all rollbacks in a single transaction
  const rollbackAll = db.transaction(() => {
    for (const migration of migrations) {
      try {
        console.log(`[Migrations] Rolling back migration v${migration.version}: ${migration.name}`);
        migration.down(db);

        console.log(`[Migrations] ✓ Rollback v${migration.version} completed`);
      } catch (error) {
        console.error(`[Migrations] ✗ Rollback v${migration.version} failed:`, error);
        throw error; // Transaction will rollback
      }
    }
  });

  try {
    rollbackAll();
    console.log(`[Migrations] All rollbacks completed successfully`);
  } catch (error) {
    console.error('[Migrations] Rollback failed:', error);
    throw error;
  }
}

/**
 * Get migration history
 * Now simplified - just returns the current version
 */
export function getMigrationHistory(db: Database.Database): Array<{ version: number; name: string; timestamp: number }> {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  // Return a simple array with just the current version
  return [
    {
      version: currentVersion,
      name: `Current schema version`,
      timestamp: Date.now(),
    },
  ];
}

/**
 * Check if a specific migration has been applied
 * Now simplified - checks if current version >= target version
 */
export function isMigrationApplied(db: Database.Database, version: number): boolean {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  return currentVersion >= version;
}
