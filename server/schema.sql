-- Apply once with the platform's D1 migration command, never during requests.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS bk_profiles (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  last_match_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  origin TEXT NOT NULL DEFAULT 'mountain' CHECK (origin IN ('mountain','river','seed','grass','flower','tree')),
  origin_v2 TEXT CHECK (origin_v2 IN ('mountain','river','seed','grass','flower','tree','king'))
);
CREATE TABLE IF NOT EXISTS bk_occupancy (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  kind TEXT NOT NULL CHECK (kind IN ('room','queue','match')),
  ref TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bk_occupancy_ref ON bk_occupancy(kind, ref);
CREATE TABLE IF NOT EXISTS bk_queue (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  id TEXT NOT NULL UNIQUE,
  deck_json TEXT NOT NULL,
  special_json TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bk_queue_waiting ON bk_queue(joined_at, last_seen);
CREATE TABLE IF NOT EXISTS bk_rooms (
  code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL REFERENCES bk_profiles(id),
  guest_id TEXT REFERENCES bk_profiles(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','matched','closed')),
  host_deck_json TEXT NOT NULL,
  host_special_json TEXT NOT NULL,
  match_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bk_rooms_host ON bk_rooms(host_id, status);
CREATE TABLE IF NOT EXISTS bk_matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('room','ranked')),
  room_code TEXT,
  player0 TEXT NOT NULL REFERENCES bk_profiles(id),
  player1 TEXT REFERENCES bk_profiles(id),
  name0 TEXT NOT NULL,
  name1 TEXT NOT NULL,
  rating0 INTEGER NOT NULL,
  rating1 INTEGER NOT NULL,
  bot INTEGER NOT NULL DEFAULT 0 CHECK (bot IN (0,1)),
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  reason TEXT,
  turn_deadline INTEGER NOT NULL,
  rating_delta0 INTEGER NOT NULL DEFAULT 0,
  rating_delta1 INTEGER NOT NULL DEFAULT 0,
  rating_applied INTEGER NOT NULL DEFAULT 0 CHECK (rating_applied IN (0,1)),
  write_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((bot = 1 AND player1 IS NULL) OR (bot = 0 AND player1 IS NOT NULL AND player1 <> player0))
);
CREATE INDEX IF NOT EXISTS bk_matches_player0 ON bk_matches(player0, created_at);
CREATE INDEX IF NOT EXISTS bk_matches_player1 ON bk_matches(player1, created_at);
CREATE TABLE IF NOT EXISTS bk_actions (
  match_id TEXT NOT NULL REFERENCES bk_matches(id),
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  action_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id, action_id)
);

CREATE TABLE IF NOT EXISTS bk_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('original','linked')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS bk_sessions_player ON bk_sessions(player_id, revoked_at);
CREATE TABLE IF NOT EXISTS bk_presence (
  session_id TEXT PRIMARY KEY REFERENCES bk_sessions(id),
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  online_until INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE INDEX IF NOT EXISTS bk_presence_online ON bk_presence(online_until, player_id);
CREATE INDEX IF NOT EXISTS bk_presence_login ON bk_presence(last_login_at, player_id);
CREATE TABLE IF NOT EXISTS bk_link_codes (
  code_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claim_session_id TEXT
);
CREATE INDEX IF NOT EXISTS bk_link_codes_player ON bk_link_codes(player_id);
CREATE TABLE IF NOT EXISTS bk_account_limits (
  bucket TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bk_account_limits_expiry ON bk_account_limits(updated_at);
CREATE TABLE IF NOT EXISTS bk_cloud_saves (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  data_json TEXT NOT NULL,
  write_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bk_save_mutations (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mutation_id)
);
CREATE TABLE IF NOT EXISTS bk_operator (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  player_id TEXT NOT NULL UNIQUE REFERENCES bk_profiles(id),
  activated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bk_operator_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  notice TEXT NOT NULL DEFAULT '',
  maintenance INTEGER NOT NULL DEFAULT 0 CHECK (maintenance IN (0,1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES bk_profiles(id)
);
CREATE TABLE IF NOT EXISTS bk_operator_audit (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bk_operator_audit_time ON bk_operator_audit(created_at);
CREATE TABLE IF NOT EXISTS bk_operator_mutations (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mutation_id)
);
CREATE TABLE IF NOT EXISTS bk_announcements (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('message','gift')),
  target_player TEXT REFERENCES bk_profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  treasure INTEGER NOT NULL DEFAULT 0 CHECK (treasure >= 0 AND treasure <= 100000),
  cards_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  created_by TEXT NOT NULL REFERENCES bk_profiles(id)
);
CREATE INDEX IF NOT EXISTS bk_announcements_target ON bk_announcements(target_player, created_at);
CREATE TABLE IF NOT EXISTS bk_inbox_reads (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  item_id TEXT NOT NULL REFERENCES bk_announcements(id),
  read_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE IF NOT EXISTS bk_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL CHECK (end_at > start_at),
  status TEXT NOT NULL CHECK (status IN ('draft','published','ended')),
  treasure INTEGER NOT NULL DEFAULT 0 CHECK (treasure >= 0 AND treasure <= 100000),
  cards_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES bk_profiles(id)
);
CREATE INDEX IF NOT EXISTS bk_events_schedule ON bk_events(status, start_at, end_at);
CREATE TABLE IF NOT EXISTS bk_reward_claims (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('gift','event')),
  item_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  save_revision INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_type, item_id)
);
