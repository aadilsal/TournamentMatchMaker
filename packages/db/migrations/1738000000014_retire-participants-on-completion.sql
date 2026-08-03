-- Up Migration

-- Completing a tournament only changed the tournament's own status; it never
-- touched tournament_participants. Players stayed 'active'/'knockout' in a
-- finished tournament forever, and the registration check counts exactly those
-- statuses with no regard for whether the tournament is over — so finishing a
-- tournament left every one of its players permanently unable to join another,
-- while the UI still showed them a Join button.
--
-- Retire everyone still holding a place in an already-completed tournament.
-- 'out' is the terminal status: beaten out, or withdrawn.
UPDATE tournament_participants tp
SET status = 'out', updated_at = NOW()
FROM tournaments t
WHERE t.id = tp.tournament_id
  AND t.status = 'completed'
  AND tp.status <> 'out';

-- Down Migration

-- Deliberately empty. The pre-migration state cannot be reconstructed (which
-- players were 'active' vs 'knockout' vs 'eliminated' when the tournament
-- finished is not recorded anywhere), and restoring it would only re-create the
-- lockout this migration exists to clear.
SELECT 1;
