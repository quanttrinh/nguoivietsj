UPDATE events
SET default_locale = CASE
  WHEN json_extract(title_json, '$.en') IS NOT NULL THEN 'en'
  ELSE COALESCE(
    (SELECT key
     FROM json_each(events.title_json)
     WHERE key IN ('en', 'fr', 'vi')
     LIMIT 1),
    'en'
  )
END
WHERE json_extract(title_json, '$.' || default_locale) IS NULL;
