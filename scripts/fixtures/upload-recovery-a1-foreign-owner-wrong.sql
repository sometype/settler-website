ALTER TABLE listing_submissions ADD COLUMN gallery_epoch bigint NOT NULL DEFAULT 0;
ALTER TABLE submission_upload_tickets ADD COLUMN gallery_epoch bigint NOT NULL DEFAULT 0;
