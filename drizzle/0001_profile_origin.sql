ALTER TABLE bk_profiles ADD COLUMN origin TEXT NOT NULL DEFAULT 'mountain' CHECK (origin IN ('mountain','river','seed','grass','flower','tree'));
