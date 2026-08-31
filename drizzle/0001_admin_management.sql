CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (token) REFERENCES sessions(token) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS deleted_users (
  user_id TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL,
  deleted_by_user_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
PRAGMA optimize;
