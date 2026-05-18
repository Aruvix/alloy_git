use keyring::Entry;

const SERVICE: &str = "com.alloy.git";

#[tauri::command]
pub fn vault_store(key: String, value: String) -> Result<(), String> {
    Entry::new(SERVICE, &key)
        .map_err(|e| format!("Keychain error: {e}"))?
        .set_password(&value)
        .map_err(|e| format!("Failed to store credential: {e}"))
}

#[tauri::command]
pub fn vault_load(key: String) -> Result<String, String> {
    Entry::new(SERVICE, &key)
        .map_err(|e| format!("Keychain error: {e}"))?
        .get_password()
        .map_err(|e| format!("Failed to load credential: {e}"))
}

#[tauri::command]
pub fn vault_delete(key: String) -> Result<(), String> {
    Entry::new(SERVICE, &key)
        .map_err(|e| format!("Keychain error: {e}"))?
        .delete_credential()
        .map_err(|e| format!("Failed to delete credential: {e}"))
}
