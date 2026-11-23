CREATE TABLE bk_rebuild_saves (
  player_id TEXT PRIMARY KEY REFERENCES bk_profiles(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  data_json TEXT NOT NULL,
  write_token TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE bk_rebuild_save_mutations (
  player_id TEXT NOT NULL REFERENCES bk_profiles(id),
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, mutation_id)
);
