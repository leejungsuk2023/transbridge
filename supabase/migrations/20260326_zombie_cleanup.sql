-- Zombie session cleanup function
-- Auto-ends sessions that have been active for more than 1 hour.
--
-- To schedule with pg_cron (requires Supabase Pro plan):
--   SELECT cron.schedule('cleanup-zombie-sessions', '0 * * * *', 'SELECT cleanup_zombie_sessions()');
--
-- Without pg_cron, run this query manually or call it from a periodic external job.

CREATE OR REPLACE FUNCTION cleanup_zombie_sessions()
RETURNS void AS $$
BEGIN
  UPDATE sessions
  SET status = 'ended',
      ended_at = now(),
      duration_sec = EXTRACT(EPOCH FROM (now() - started_at))::integer
  WHERE status = 'active'
    AND started_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
