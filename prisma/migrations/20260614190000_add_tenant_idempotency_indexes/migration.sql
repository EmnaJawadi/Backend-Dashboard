DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM contacts
    WHERE company_id IS NOT NULL AND phone IS NOT NULL
    GROUP BY company_id, phone
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate contacts exist for the same company and phone. Resolve them before applying this migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM messages
    WHERE company_id IS NOT NULL AND external_message_id IS NOT NULL
    GROUP BY company_id, external_message_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate messages exist for the same company and external message id. Resolve them before applying this migration.';
  END IF;
END $$;

CREATE UNIQUE INDEX "contacts_company_id_phone_key"
  ON "contacts"("company_id", "phone");

CREATE UNIQUE INDEX "messages_company_id_external_message_id_key"
  ON "messages"("company_id", "external_message_id");
