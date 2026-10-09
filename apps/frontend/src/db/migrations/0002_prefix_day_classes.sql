-- Template class names for a day's number and name are prefixed by page type, so each page type
-- can be styled on its own: w- on weekly pages, d- on daily pages, m- on monthly pages. The
-- monthly day number was `monthly-day-cell-date`. Saved templates hold the old names in their
-- content JSON; rewrite them here so existing planners keep rendering. Both the compact form
-- written by JSON.stringify and the spaced form of hand-edited JSON are matched, and the closing
-- quote is part of the match so longer names (`monthly-day-cell-date-box`) are left alone.

UPDATE page_templates
SET content = replace(replace(replace(replace(content,
      '"class":"day-number"', '"class":"w-day-number"'),
      '"class": "day-number"', '"class": "w-day-number"'),
      '"class":"day-name"', '"class":"w-day-name"'),
      '"class": "day-name"', '"class": "w-day-name"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    version = version + 1
WHERE template_type IN ('weekly', 'weekly_left', 'weekly_right')
  AND (content LIKE '%"day-number"%' OR content LIKE '%"day-name"%');

UPDATE page_templates
SET content = replace(replace(replace(replace(content,
      '"class":"day-number"', '"class":"d-day-number"'),
      '"class": "day-number"', '"class": "d-day-number"'),
      '"class":"day-name"', '"class":"d-day-name"'),
      '"class": "day-name"', '"class": "d-day-name"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    version = version + 1
WHERE template_type = 'daily'
  AND (content LIKE '%"day-number"%' OR content LIKE '%"day-name"%');

UPDATE page_templates
SET content = replace(replace(replace(replace(replace(replace(content,
      '"class":"day-number"', '"class":"m-day-number"'),
      '"class": "day-number"', '"class": "m-day-number"'),
      '"class":"monthly-day-cell-date"', '"class":"m-day-number"'),
      '"class": "monthly-day-cell-date"', '"class": "m-day-number"'),
      '"class":"day-name"', '"class":"m-day-name"'),
      '"class": "day-name"', '"class": "m-day-name"'),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    version = version + 1
WHERE template_type = 'monthly'
  AND (content LIKE '%"day-number"%' OR content LIKE '%"day-name"%' OR content LIKE '%"monthly-day-cell-date"%');
