import Database from "@tauri-apps/plugin-sql";

type DbInstance = Awaited<ReturnType<typeof Database.load>>;

let db: DbInstance | null = null;
let dbInitPromise: Promise<DbInstance> | null = null;
let schemaInitPromise: Promise<void> | null = null;

/**
 * Returns the shared SQLite connection, initializing it once.
 * Concurrent callers all await the same promise — no duplicate connections.
 */
export async function getDb(): Promise<DbInstance> {
  if (!dbInitPromise) {
    dbInitPromise = Database.load("sqlite:alloy.db");
  }
  if (!db) {
    db = await dbInitPromise;
  }
  if (!schemaInitPromise) {
    schemaInitPromise = ensureExtendedSchema(db);
  }
  await schemaInitPromise;
  return db;
}

async function ensureExtendedSchema(database: DbInstance): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS local_repositories (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      linked_remote_id TEXT,
      linked_account_id TEXT,
      workspace_id TEXT,
      provider TEXT,
      remote_url TEXT,
      is_local_only INTEGER NOT NULL DEFAULT 0,
      added_at TEXT NOT NULL,
      last_opened_at TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      group_id TEXT
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS repository_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS git_accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      username TEXT,
      email TEXT,
      remote_base_url TEXT,
      auth_type TEXT NOT NULL,
      ssh_key_path TEXT,
      use_system_credentials INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'untested',
      validation_message TEXT,
      scopes TEXT,
      repository_count INTEGER,
      last_authenticated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS cloud_repositories (
      id TEXT NOT NULL,
      git_account_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      owner TEXT,
      remote_url TEXT NOT NULL,
      ssh_remote_url TEXT,
      web_url TEXT,
      default_branch TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'unknown',
      local_path TEXT,
      last_synced_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (id, git_account_id)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS provider_metadata (
      provider TEXT NOT NULL,
      remote_base_url TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, remote_base_url)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS global_git_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      default_account_id TEXT,
      default_repository_id TEXT,
      author_name TEXT NOT NULL DEFAULT '',
      author_email TEXT NOT NULL DEFAULT '',
      default_branch TEXT NOT NULL DEFAULT 'main',
      default_clone_directory TEXT NOT NULL DEFAULT '',
      auto_pull_before_push INTEGER NOT NULL DEFAULT 0,
      auto_commit_message_template TEXT NOT NULL DEFAULT '',
      secret_scan_mode TEXT NOT NULL DEFAULT 'warn'
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS workspace_indexes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    )
  `);

  // Additive migrations — errors mean the column already exists on fresh DBs.
  const migrations = [
    "ALTER TABLE global_git_config ADD COLUMN default_repository_id TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN owner TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN ssh_remote_url TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN web_url TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN updated_at TEXT",
    "ALTER TABLE local_repositories ADD COLUMN workspace_id TEXT",
    "ALTER TABLE local_repositories ADD COLUMN provider TEXT",
    "ALTER TABLE local_repositories ADD COLUMN remote_url TEXT",
    "ALTER TABLE local_repositories ADD COLUMN is_local_only INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of migrations) {
    try {
      await database.execute(sql);
    } catch {
      // Column already exists — safe to ignore.
    }
  }
}
