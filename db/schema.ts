export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    host_user_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting', 'playing', 'finished')),
    game_state TEXT,
    current_match_id TEXT,
    version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (host_user_id) REFERENCES users(id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code)`,
  `CREATE INDEX IF NOT EXISTS idx_rooms_status_updated ON rooms(status, updated_at)`,
  `CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 3),
    ready INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_room_members_seat ON room_members(room_id, seat)`,
  `CREATE INDEX IF NOT EXISTS idx_room_members_user_active ON room_members(user_id, active)`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_matches_room_id ON matches(room_id)`,
  `CREATE TABLE IF NOT EXISTS match_results (
    match_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    final_score INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    uma REAL NOT NULL,
    penalty REAL NOT NULL DEFAULT 0,
    total_pt REAL NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (match_id, user_id),
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_match_results_user_created ON match_results(user_id, created_at DESC)`,
];
