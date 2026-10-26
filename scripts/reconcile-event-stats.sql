-- Recompute denormalized event-engine counters from source rows.
--
-- Run during a maintenance window, when no registrations are being written:
--   wrangler d1 execute EVENT_ENGINE_DB --remote --file scripts/reconcile-event-stats.sql
--
-- The normal registration batch keeps these counters current. This script is a
-- repair tool for manual cleanup, restored data, or historical anomalies.

UPDATE registration_stats
SET
  registration_count = (
    SELECT COUNT(*) FROM registrations
    WHERE registrations.event_id = registration_stats.event_id
  ),
  tickets_total = COALESCE((
    SELECT SUM(quantity) FROM registration_tickets
    WHERE registration_tickets.event_id = registration_stats.event_id
  ), 0);

INSERT INTO registration_stats (event_id, registration_count, tickets_total)
SELECT
  events.id,
  (SELECT COUNT(*) FROM registrations WHERE registrations.event_id = events.id),
  COALESCE((SELECT SUM(quantity) FROM registration_tickets WHERE registration_tickets.event_id = events.id), 0)
FROM events
WHERE NOT EXISTS (
  SELECT 1 FROM registration_stats
  WHERE registration_stats.event_id = events.id
);

UPDATE ticket_type_stats
SET tickets_sold = COALESCE((
  SELECT SUM(quantity) FROM registration_tickets
  WHERE registration_tickets.event_id = ticket_type_stats.event_id
    AND registration_tickets.ticket_type_key = ticket_type_stats.ticket_type_key
), 0);

INSERT INTO ticket_type_stats (event_id, ticket_type_key, tickets_sold)
SELECT
  event_ticket_types.event_id,
  event_ticket_types.key,
  COALESCE(SUM(registration_tickets.quantity), 0)
FROM event_ticket_types
LEFT JOIN registration_tickets
  ON registration_tickets.event_id = event_ticket_types.event_id
 AND registration_tickets.ticket_type_key = event_ticket_types.key
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_type_stats
  WHERE ticket_type_stats.event_id = event_ticket_types.event_id
    AND ticket_type_stats.ticket_type_key = event_ticket_types.key
)
GROUP BY event_ticket_types.event_id, event_ticket_types.key;
