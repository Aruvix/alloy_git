mod crypto;
mod git;
mod repository;
mod terminal;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:alloy.db", repository::migrations())
                .build(),
        )
        .manage(terminal::PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            // Git core
            git::git_status,
            git::git_init,
            git::git_clone,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::git_stage,
            git::git_unstage,
            git::git_discard,
            git::git_commit,
            git::git_diff,
            git::git_show_file,
            git::git_read_worktree_file,
            git::git_write_worktree_file,
            git::git_log,
            git::git_commit_diff,
            git::git_revert_commit,
            // Branches
            git::git_list_branches,
            git::git_checkout,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_rename_branch,
            // Remotes
            git::git_remote_list,
            git::git_remote_set,
            git::git_remote_remove,
            // Stashes
            git::git_stash_list,
            git::git_stash_push,
            git::git_stash_apply,
            git::git_stash_drop,
            git::git_stash_diff,
            // Conflict resolution
            git::git_conflict_file,
            git::git_conflict_accept,
            git::git_mark_resolved,
            git::git_continue,
            git::git_abort,
            git::git_merge,
            git::git_rebase,
            // Tags
            git::git_tag_list,
            git::git_tag_create,
            git::git_tag_delete,
            // Worktrees
            git::git_worktree_list,
            git::git_worktree_add,
            git::git_worktree_remove,
            // Legacy terminal passthrough (kept for backwards compat)
            git::git_terminal_run,
            git::list_terminals,
            git::open_in_terminal,
            // PTY terminal — real interactive shell sessions
            terminal::detect_shells,
            terminal::pty_create,
            terminal::pty_write,
            terminal::pty_resize,
            terminal::pty_kill,
            // GitHub CLI
            git::github_cli_token,
            // Credential vault
            crypto::vault_store,
            crypto::vault_load,
            crypto::vault_delete,
            // Repository management
            repository::repo_open_dialog,
            repository::repo_validate_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Alloy Git");
}
