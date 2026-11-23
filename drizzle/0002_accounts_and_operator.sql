CREATE TABLE  bk_sessions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('original','linked')),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
);
--> statement-breakpoint
CREATE INDEX  bk_sessions_player ON bk_sessions(player_id, revoked_at);
--> statement-breakpoint
CREATE TABLE  bk_presence (
  session_id TEXT PRIMARY KEY REFERENCES bk_sessions(id),
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  online_until INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_login_at INTEGER
);
--> statement-breakpoint
CREATE INDEX  bk_presence_online ON bk_presence(online_until, player_id);
--> statement-breakpoint
CREATE INDEX  bk_presence_login ON bk_presence(last_login_at, player_id);
--> statement-breakpoint
CREATE TABLE  bk_link_codes (
  code_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claim_session_id TEXT
);
--> statement-breakpoint
CREATE INDEX  bk_link_codes_player ON bk_link_codes(player_id);
--> statement-breakpoint
CREATE TABLE  bk_account_limits (
  bucket TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX  bk_account_limits_expiry ON bk_account_limits(updated_at);
--> statement-breakpoint
CREATE TABLE  bk_cloud_saves (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  data_json TEXT NOT NULL,
  write_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE  bk_save_mutations (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mutation_id)
);
--> statement-breakpoint
CREATE TABLE  bk_operator (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  player_id TEXT NOT NULL UNIQUE REFERENCES bk_profiles(id),
  activated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE  bk_operator_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  notice TEXT NOT NULL DEFAULT '',
  maintenance INTEGER NOT NULL DEFAULT 0 CHECK (maintenance IN (0,1)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES bk_profiles(id)
);
--> statement-breakpoint
CREATE TABLE  bk_operator_audit (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX  bk_operator_audit_time ON bk_operator_audit(created_at);
--> statement-breakpoint
CREATE TABLE  bk_operator_mutations (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mutation_id)
);
--> statement-breakpoint
CREATE TABLE  bk_announcements (
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
--> statement-breakpoint
CREATE INDEX  bk_announcements_target ON bk_announcements(target_player, created_at);
--> statement-breakpoint
CREATE TABLE  bk_inbox_reads (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  item_id TEXT NOT NULL REFERENCES bk_announcements(id),
  read_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_id)
);
--> statement-breakpoint
CREATE TABLE  bk_events (
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
--> statement-breakpoint
CREATE INDEX  bk_events_schedule ON bk_events(status, start_at, end_at);
--> statement-breakpoint
CREATE TABLE  bk_reward_claims (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  item_type TEXT NOT NULL CHECK (item_type IN ('gift','event')),
  item_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  save_revision INTEGER NOT NULL,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_type, item_id)
);
