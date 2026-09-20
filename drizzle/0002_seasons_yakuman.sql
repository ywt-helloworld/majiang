CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_start_at ON seasons(start_at);
CREATE TABLE IF NOT EXISTS yakuman_wins (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  yakuman_name TEXT NOT NULL,
  round_label TEXT NOT NULL,
  won_at INTEGER NOT NULL,
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_yakuman_wins_user_won_at ON yakuman_wins(user_id, won_at DESC);
CREATE INDEX IF NOT EXISTS idx_yakuman_wins_match_id ON yakuman_wins(match_id);
PRAGMA optimize;
