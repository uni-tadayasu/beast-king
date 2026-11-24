ALTER TABLE bk_announcements ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','ended'));
--> statement-breakpoint
ALTER TABLE bk_announcements ADD COLUMN publish_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE bk_announcements ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
--> statement-breakpoint
ALTER TABLE bk_announcements ADD COLUMN updated_at INTEGER;
--> statement-breakpoint
ALTER TABLE bk_announcements ADD COLUMN delivery_locked INTEGER NOT NULL DEFAULT 0 CHECK (delivery_locked IN (0,1));
--> statement-breakpoint
CREATE INDEX bk_announcements_schedule ON bk_announcements(status,publish_at,expires_at);
--> statement-breakpoint
ALTER TABLE bk_events ADD COLUMN target_player TEXT REFERENCES bk_profiles(id);
--> statement-breakpoint
ALTER TABLE bk_events ADD COLUMN delivery_locked INTEGER NOT NULL DEFAULT 0 CHECK (delivery_locked IN (0,1));
--> statement-breakpoint
ALTER TABLE bk_operator_settings ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);
--> statement-breakpoint
ALTER TABLE bk_operator_settings ADD COLUMN maintenance_start_at INTEGER;
--> statement-breakpoint
ALTER TABLE bk_operator_settings ADD COLUMN maintenance_end_at INTEGER;
--> statement-breakpoint
ALTER TABLE bk_operator_settings ADD COLUMN maintenance_message TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE bk_notices (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER CHECK (end_at IS NULL OR end_at > start_at),
  status TEXT NOT NULL CHECK (status IN ('draft','published','ended')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 9),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL REFERENCES bk_profiles(id)
);
--> statement-breakpoint
CREATE INDEX bk_notices_schedule ON bk_notices(status,start_at,end_at,priority);
