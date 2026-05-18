use serde::Serialize;
use tauri_plugin_sql::Migration;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoValidation {
    pub is_git_repo: bool,
    pub name: String,
    pub path: String,
}

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: r#"
            CREATE TABLE IF NOT EXISTS local_repositories (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                linked_remote_id TEXT,
                linked_account_id TEXT,
                added_at TEXT NOT NULL,
                last_opened_at TEXT,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                group_id TEXT
            );

            CREATE TABLE IF NOT EXISTS repository_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT,
                created_at TEXT NOT NULL
            );

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
            );

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
                PRIMARY KEY (id, git_account_id),
                FOREIGN KEY (git_account_id) REFERENCES git_accounts(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS provider_metadata (
                provider TEXT NOT NULL,
                remote_base_url TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (provider, remote_base_url)
            );

            CREATE TABLE IF NOT EXISTS workspace_indexes (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                source TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            );

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
            );
        "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_local_repository_remote_metadata",
            sql: r#"
            ALTER TABLE local_repositories ADD COLUMN workspace_id TEXT;
            ALTER TABLE local_repositories ADD COLUMN provider TEXT;
            ALTER TABLE local_repositories ADD COLUMN remote_url TEXT;
            ALTER TABLE local_repositories ADD COLUMN is_local_only INTEGER NOT NULL DEFAULT 0;
        "#,
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ]
}

#[tauri::command]
pub async fn repo_open_dialog(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .set_title("Open Repository")
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn repo_validate_path(path: String) -> Result<RepoValidation, String> {
    use std::path::Path;
    use std::process::Command;
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    let git_check = Command::new("git")
        .current_dir(&path)
        .args(["rev-parse", "--git-dir"])
        .output()
        .map_err(|e| format!("git check failed: {e}"))?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    Ok(RepoValidation {
        is_git_repo: git_check.status.success(),
        name,
        path,
    })
}
