-- 0013: Reset all data (keeps schema intact)
-- Run: cd classroom-backend && npx tsx src/db/migrate-manual.ts drizzle/0013_reset_data.sql

-- Order matters: FK constraints
DELETE FROM demo_files;
DELETE FROM demos;
DELETE FROM edges;
DELETE FROM item_files;
DELETE FROM items;
DELETE FROM categories;

-- Reset identity sequences so IDs start from 1
ALTER SEQUENCE items_id_seq RESTART WITH 1;
ALTER SEQUENCE edges_id_seq RESTART WITH 1;
ALTER SEQUENCE item_files_id_seq RESTART WITH 1;
ALTER SEQUENCE categories_id_seq RESTART WITH 1;
ALTER SEQUENCE demos_id_seq RESTART WITH 1;
ALTER SEQUENCE demo_files_id_seq RESTART WITH 1;
