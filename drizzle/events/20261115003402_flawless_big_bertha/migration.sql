ALTER TABLE `registration_contacts` ADD `manual` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `manual` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `registration_contacts_event_email`;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_contacts_event_email` ON `registration_contacts` (`event_id`,`email_normalized`) WHERE "registration_contacts"."kind" = 'email' AND "registration_contacts"."email_normalized" IS NOT NULL AND "registration_contacts"."manual" = 0;--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_tickets_type_max_guard;--> statement-breakpoint
CREATE TRIGGER registration_tickets_type_max_guard
BEFORE INSERT ON registration_tickets
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM event_ticket_types AS t
  WHERE t.event_id = NEW.event_id
    AND t.key = NEW.ticket_type_key
    AND t.max_per_registration IS NOT NULL
    AND NEW.quantity > t.max_per_registration
)
AND NOT EXISTS (
  SELECT 1 FROM registrations AS r
  WHERE r.id = NEW.registration_id AND r.manual = 1
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_type_limit_reached');
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_tickets_combined_guard;--> statement-breakpoint
CREATE TRIGGER registration_tickets_combined_guard
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
AND NOT EXISTS (
  SELECT 1 FROM registrations AS r
  WHERE r.id = NEW.registration_id AND r.manual = 1
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_limit_reached');
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_tickets_type_capacity_guard;--> statement-breakpoint
CREATE TRIGGER registration_tickets_type_capacity_guard
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
AND NOT EXISTS (
  SELECT 1 FROM registrations AS r
  WHERE r.id = NEW.registration_id AND r.manual = 1
)
BEGIN
  SELECT RAISE(ABORT, 'ticket_type_capacity_reached');
END;--> statement-breakpoint
DROP TRIGGER IF EXISTS registration_tickets_event_capacity_guard;--> statement-breakpoint
CREATE TRIGGER registration_tickets_event_capacity_guard
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
AND NOT EXISTS (
  SELECT 1 FROM registrations AS r
  WHERE r.id = NEW.registration_id AND r.manual = 1
)
BEGIN
  SELECT RAISE(ABORT, 'event_capacity_reached');
END;
