ALTER TABLE bk_profiles ADD COLUMN origin_v2 TEXT CHECK (origin_v2 IN ('mountain','river','seed','grass','flower','tree','king'));
