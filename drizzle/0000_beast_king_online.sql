CREATE TABLE  bk_profiles (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  last_match_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE  bk_occupancy (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  kind TEXT NOT NULL CHECK (kind IN ('room','queue','match')),
  ref TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX  bk_occupancy_ref ON bk_occupancy(kind, ref);
--> statement-breakpoint
CREATE TABLE  bk_queue (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  id TEXT NOT NULL UNIQUE,
  deck_json TEXT NOT NULL,
  special_json TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX  bk_queue_waiting ON bk_queue(joined_at, last_seen);
--> statement-breakpoint
CREATE TABLE  bk_rooms (
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
--> statement-breakpoint
CREATE INDEX  bk_rooms_host ON bk_rooms(host_id, status);
--> statement-breakpoint
CREATE TABLE  bk_matches (
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
--> statement-breakpoint
CREATE INDEX  bk_matches_player0 ON bk_matches(player0, created_at);
--> statement-breakpoint
CREATE INDEX  bk_matches_player1 ON bk_matches(player1, created_at);
--> statement-breakpoint
CREATE TABLE  bk_actions (
  match_id TEXT NOT NULL REFERENCES bk_matches(id),
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  action_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id, action_id)
);
