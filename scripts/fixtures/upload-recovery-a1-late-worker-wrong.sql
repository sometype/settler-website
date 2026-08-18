-- Wrong on purpose: deleting current rows has no durable generation fence.
ALTER TABLE listing_submissions ADD COLUMN reset_note text;
