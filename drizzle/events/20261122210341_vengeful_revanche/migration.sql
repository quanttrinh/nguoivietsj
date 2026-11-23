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
--> statement-breakpoint
-- Search index for staff registration search.
-- D1 supports FTS5; the index is maintained by triggers so the existing
-- registration write batch does not need to know about it.

CREATE VIRTUAL TABLE `registration_search` USING fts5(
  `registration_id` UNINDEXED,
  `event_id` UNINDEXED,
  `full_name`,
  `emails`,
  `phones`,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `registration_search` (`registration_id`, `event_id`, `full_name`, `emails`, `phones`)
SELECT
  r.`id`,
  r.`event_id`,
  r.`full_name_normalized`,
  COALESCE((
    SELECT group_concat(c.`email_normalized`, ' ')
    FROM `registration_contacts` c
    WHERE c.`registration_id` = r.`id` AND c.`kind` = 'email'
  ), ''),
  COALESCE((
    SELECT group_concat(c.`phone_normalized`, ' ')
    FROM `registration_contacts` c
    WHERE c.`registration_id` = r.`id` AND c.`kind` = 'phone'
  ), '')
FROM `registrations` r;
--> statement-breakpoint
CREATE TRIGGER `registration_search_registration_insert`
AFTER INSERT ON `registrations`
BEGIN
  INSERT INTO `registration_search` (`registration_id`, `event_id`, `full_name`, `emails`, `phones`)
  VALUES (NEW.`id`, NEW.`event_id`, NEW.`full_name_normalized`, '', '');
END;
--> statement-breakpoint
CREATE TRIGGER `registration_search_registration_update`
AFTER UPDATE OF `full_name_normalized` ON `registrations`
BEGIN
  UPDATE `registration_search`
  SET `full_name` = NEW.`full_name_normalized`
  WHERE `registration_id` = NEW.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `registration_search_registration_delete`
AFTER DELETE ON `registrations`
BEGIN
  DELETE FROM `registration_search` WHERE `registration_id` = OLD.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER `registration_search_contact_insert`
AFTER INSERT ON `registration_contacts`
BEGIN
  UPDATE `registration_search`
  SET
    `emails` = trim(`emails` || ' ' || COALESCE(NEW.`email_normalized`, '')),
    `phones` = trim(`phones` || ' ' || COALESCE(NEW.`phone_normalized`, ''))
  WHERE `registration_id` = NEW.`registration_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `registration_search_contact_update`
AFTER UPDATE OF `registration_id`, `kind`, `email_normalized`, `phone_normalized`
ON `registration_contacts`
BEGIN
  UPDATE `registration_search`
  SET
    `emails` = COALESCE((
      SELECT group_concat(c.`email_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = OLD.`registration_id` AND c.`kind` = 'email'
    ), ''),
    `phones` = COALESCE((
      SELECT group_concat(c.`phone_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = OLD.`registration_id` AND c.`kind` = 'phone'
    ), '')
  WHERE `registration_id` = OLD.`registration_id`;

  UPDATE `registration_search`
  SET
    `emails` = COALESCE((
      SELECT group_concat(c.`email_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = NEW.`registration_id` AND c.`kind` = 'email'
    ), ''),
    `phones` = COALESCE((
      SELECT group_concat(c.`phone_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = NEW.`registration_id` AND c.`kind` = 'phone'
    ), '')
  WHERE `registration_id` = NEW.`registration_id`;
END;
--> statement-breakpoint
CREATE TRIGGER `registration_search_contact_delete`
AFTER DELETE ON `registration_contacts`
BEGIN
  UPDATE `registration_search`
  SET
    `emails` = COALESCE((
      SELECT group_concat(c.`email_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = OLD.`registration_id` AND c.`kind` = 'email'
    ), ''),
    `phones` = COALESCE((
      SELECT group_concat(c.`phone_normalized`, ' ')
      FROM `registration_contacts` c
      WHERE c.`registration_id` = OLD.`registration_id` AND c.`kind` = 'phone'
    ), '')
  WHERE `registration_id` = OLD.`registration_id`;
END;
