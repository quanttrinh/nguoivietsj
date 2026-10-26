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
