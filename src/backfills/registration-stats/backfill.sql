DELETE FROM ticket_type_stats;
INSERT INTO ticket_type_stats (event_id, ticket_type_key, tickets_sold)
SELECT t.event_id, t.key, COALESCE(SUM(r.quantity), 0)
FROM event_ticket_types AS t
LEFT JOIN registration_tickets AS r
  ON r.event_id = t.event_id
 AND r.ticket_type_key = t.key
GROUP BY t.event_id, t.key;

DELETE FROM registration_stats;
INSERT INTO registration_stats (event_id, registration_count, tickets_total)
SELECT e.id,
       (SELECT COUNT(*) FROM registrations WHERE event_id = e.id),
       (SELECT COALESCE(SUM(quantity), 0)
        FROM registration_tickets
        WHERE event_id = e.id)
FROM events AS e;
