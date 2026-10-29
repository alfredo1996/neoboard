-- A table with no saved page size fits its card (#2356). Every table saved the
-- old default, pageSize: 10, so none ever did: remove it from saved table
-- widgets and widget templates. Other values (5, 8, 15, 25) were chosen, so
-- they stay. Idempotent: once removed, no row matches. Dashboard version
-- history is left as it was saved.
UPDATE "dashboard" d
SET "layoutJson" = jsonb_set(
  d."layoutJson",
  '{pages}',
  (
    SELECT jsonb_agg(
      CASE WHEN jsonb_typeof(p.page -> 'widgets') = 'array' THEN
        jsonb_set(
          p.page,
          '{widgets}',
          (
            SELECT coalesce(jsonb_agg(
              CASE WHEN w.widget ->> 'chartType' = 'table'
                    AND w.widget #> '{settings,chartOptions,pageSize}' = '10'::jsonb
                THEN w.widget #- '{settings,chartOptions,pageSize}'
                ELSE w.widget END
              ORDER BY w.ord), '[]'::jsonb)
            FROM jsonb_array_elements(p.page -> 'widgets') WITH ORDINALITY AS w(widget, ord)
          )
        )
      ELSE p.page END
      ORDER BY p.ord)
    FROM jsonb_array_elements(d."layoutJson" -> 'pages') WITH ORDINALITY AS p(page, ord)
  )
)
WHERE jsonb_typeof(d."layoutJson" -> 'pages') = 'array'
  AND jsonb_path_exists(
    d."layoutJson",
    '$.pages[*].widgets[*] ? (@.chartType == "table" && @.settings.chartOptions.pageSize == 10)'
  );
--> statement-breakpoint
UPDATE "widget_template"
SET "settings" = "settings" #- '{chartOptions,pageSize}'
WHERE "chartType" = 'table'
  AND "settings" #> '{chartOptions,pageSize}' = '10'::jsonb;
