-- Local-only demo data: three past weeks with a miss, a late finish and a cover.
-- Moves the start back 4 weeks, which keeps this week's rotation the same.
UPDATE house SET start_week = '2026-10-04';
INSERT INTO assignments (week_start, chore, scheduled_id, assignee_id, completed_at, completed_by, late) VALUES
  ('2026-10-11', 'milk',  2, 2, '2026-10-14T18:00:00Z', 2, 0),
  ('2026-10-11', 'trash', 3, 3, '2026-10-15T18:00:00Z', 3, 0),
  ('2026-10-11', 'broom', 4, 1, '2026-10-16T18:00:00Z', 1, 0),
  ('2026-10-18', 'milk',  3, 3, NULL, NULL, 0),
  ('2026-10-18', 'trash', 4, 4, '2026-10-27T18:00:00Z', 4, 1),
  ('2026-10-18', 'broom', 1, 1, '2026-10-21T18:00:00Z', 1, 0),
  ('2026-10-25', 'milk',  4, 4, NULL, NULL, 0),
  ('2026-10-25', 'trash', 1, 1, '2026-10-28T18:00:00Z', 1, 0),
  ('2026-10-25', 'broom', 2, 2, NULL, NULL, 0);
