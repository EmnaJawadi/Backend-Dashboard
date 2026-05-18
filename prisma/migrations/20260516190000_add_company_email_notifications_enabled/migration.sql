ALTER TABLE "companies"
ADD COLUMN IF NOT EXISTS "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;

WITH company_notification_settings AS (
  SELECT DISTINCT ON (c."id")
    c."id" AS "company_id",
    CASE
      WHEN s."value" #>> '{general,emailNotificationsEnabled}' IN ('true', 'false')
        THEN (s."value" #>> '{general,emailNotificationsEnabled}')::boolean
      WHEN s."value" #>> '{general,emailNotifications}' IN ('true', 'false')
        THEN (s."value" #>> '{general,emailNotifications}')::boolean
      ELSE NULL
    END AS "email_notifications_enabled"
  FROM "companies" c
  JOIN "settings" s
    ON s."company_id" = c."id"
    OR s."key" = CONCAT('company_settings_v2:', c."id")
  ORDER BY c."id", s."updated_at" DESC
)
UPDATE "companies" c
SET "email_notifications_enabled" = company_notification_settings."email_notifications_enabled"
FROM company_notification_settings
WHERE company_notification_settings."company_id" = c."id"
  AND company_notification_settings."email_notifications_enabled" IS NOT NULL;
