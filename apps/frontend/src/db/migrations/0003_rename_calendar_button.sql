-- The mini-calendar day buttons on weekly pages are `w-calendar-button` (was `wr-calendar-button`),
-- in line with the other w- prefixed weekly classes. Saved templates hold the old name in their
-- content JSON; rewrite it so existing planners keep their calendars. Same matching rules as
-- 0002: compact and spaced JSON, closing quote included.

UPDATE page_templates
SET content = replace(replace(content,
      '"class":"wr-calendar-button"', '"class":"w-calendar-button"'),
      '"class": "wr-calendar-button"', '"class": "w-calendar-button"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    version = version + 1
WHERE content LIKE '%"wr-calendar-button"%';
