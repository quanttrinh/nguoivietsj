CREATE TRIGGER IF NOT EXISTS registration_tickets_type_max_guard
BEFORE INSERT ON registration_tickets
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM event_ticket_types AS t
  WHERE t.event_id = NEW.event_id
    AND t.key = NEW.ticket_type_key
    AND t.max_per_registration IS NOT NULL
    AND NEW.quantity > t.max_per_registration
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_type_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registration_tickets_combined_guard
BEFORE INSERT ON registration_tickets
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM event_ticket_limits AS l
  WHERE l.event_id = NEW.event_id
    AND l.max_tickets_per_registration IS NOT NULL
    AND COALESCE(
      (SELECT SUM(quantity) FROM registration_tickets
       WHERE registration_id = NEW.registration_id),
      0
    ) + NEW.quantity > l.max_tickets_per_registration
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_limit_reached');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registration_tickets_type_capacity_guard
BEFORE INSERT ON registration_tickets
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM event_ticket_types AS t
  WHERE t.event_id = NEW.event_id
    AND t.key = NEW.ticket_type_key
    AND t.capacity IS NOT NULL
    AND COALESCE(
      (SELECT s.tickets_sold FROM ticket_type_stats AS s
       WHERE s.event_id = NEW.event_id
         AND s.ticket_type_key = NEW.ticket_type_key),
      0
    ) + NEW.quantity > t.capacity
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_type_capacity_reached');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS registration_tickets_event_capacity_guard
BEFORE INSERT ON registration_tickets
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM event_ticket_limits AS l
  WHERE l.event_id = NEW.event_id
    AND l.max_total_tickets IS NOT NULL
    AND COALESCE(
      (SELECT tickets_total FROM registration_stats WHERE event_id = NEW.event_id),
      0
    ) + NEW.quantity > l.max_total_tickets
)
BEGIN
  SELECT RAISE(ABORT, 'event_capacity_reached');
END;
