-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'AgentRegistrationStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."AgentRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CompanyRegistrationStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."CompanyRegistrationStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'NEEDS_MORE_INFO');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CompanyStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."CompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'TRIAL', 'EXPIRED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'KbArticleSource'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."KbArticleSource" AS ENUM ('manual', 'human_agent_response', 'imported');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'KbArticleStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."KbArticleStatus" AS ENUM ('draft', 'published', 'archived', 'rejected');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'KbSuggestionStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."KbSuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'NotificationPriority'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."NotificationPriority" AS ENUM ('low', 'medium', 'high');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'NotificationType'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."NotificationType" AS ENUM ('COMPANY_REGISTRATION_REQUEST', 'AI_LOW_CONFIDENCE', 'HANDOFF_REQUIRED', 'CUSTOMER_REQUEST_HUMAN', 'IMPORTANT_VALIDATION', 'KB_DRAFT_SUGGESTION', 'WHATSAPP_DISCONNECTED', 'WHATSAPP_NOT_CONNECTED', 'CONVERSATION_FOLLOW_UP', 'CONVERSATION_INACTIVE_RISK', 'AGENT_REGISTRATION_REQUEST');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'SubscriptionStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UserApprovalStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'UserRole'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."UserRole" AS ENUM ('SUPER_ADMIN', 'COMPANY_ADMIN', 'AGENT', 'EMPLOYEE');
  END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'WhatsappConnectionStatus'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."WhatsappConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'QR_READY', 'CONNECTED', 'ERROR');
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."agent_registration_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "public"."AgentRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "reviewed_by_user_id" TEXT,
    "approved_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT,

    CONSTRAINT "agent_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."ai_runs" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "input_text" TEXT,
    "output_text" TEXT,
    "intent" TEXT,
    "model" TEXT,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "latency_ms" INTEGER,
    "handoff_required" BOOLEAN,
    "tags_to_apply" JSONB,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,
    "blocked_reason" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "contact_id" TEXT,
    "provider" TEXT,
    "status" TEXT,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "status" "public"."CompanyStatus" NOT NULL DEFAULT 'PENDING',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "email_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."company_registration_requests" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "business_email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "responsible_full_name" TEXT NOT NULL,
    "requested_role" "public"."UserRole" NOT NULL DEFAULT 'COMPANY_ADMIN',
    "business_type" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."CompanyRegistrationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "rejection_reason" TEXT,
    "info_request" TEXT,
    "reviewed_by_user_id" TEXT,
    "approved_company_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "activation_token" TEXT,
    "activation_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_registration_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."company_whatsapp_instances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "evolution_instance_name" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "connection_status" "public"."WhatsappConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "connected_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "api_base_url" TEXT,
    "api_key" TEXT,
    "business_account_id" TEXT,
    "display_name" TEXT,
    "last_connection_error" TEXT,
    "phone_number_id" TEXT,

    CONSTRAINT "company_whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."contact_notes" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp_name" TEXT,
    "full_name" TEXT,
    "email" TEXT,
    "language" TEXT,
    "city" TEXT,
    "country" TEXT,
    "tags" JSONB,
    "notes" TEXT,
    "segment" TEXT,
    "source" TEXT,
    "status" TEXT,
    "last_seen" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."conversation_tags" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT,
    "priority" TEXT,
    "assigned_to" TEXT,
    "bot_paused" BOOLEAN,
    "handoff_required" BOOLEAN,
    "unread_count" INTEGER,
    "last_message_at" TIMESTAMP(3),
    "last_customer_message_at" TIMESTAMP(3),
    "last_bot_message_at" TIMESTAMP(3),
    "last_human_message_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,
    "agreed_terms" TEXT,
    "budget" TEXT,
    "conversation_summary" TEXT,
    "customer_intent" TEXT,
    "delivery_address" TEXT,
    "important_notes" TEXT,
    "last_ai_decision" TEXT,
    "next_action" TEXT,
    "requested_delivery_date" TEXT,
    "requested_product_service" TEXT,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."kb_articles" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "source_url" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,
    "created_by" TEXT,
    "language" TEXT,
    "source" "public"."KbArticleSource" NOT NULL DEFAULT 'manual',
    "source_contact_id" TEXT,
    "source_conversation_id" TEXT,
    "status" "public"."KbArticleStatus" NOT NULL DEFAULT 'draft',

    CONSTRAINT "kb_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."kb_chunks" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT,
    "embedding_vector" vector(1536),
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "kb_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."kb_suggestions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "conversation_id" TEXT NOT NULL,
    "customer_message_id" TEXT NOT NULL,
    "human_answer_message_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "public"."KbSuggestionStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "kb_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "external_message_id" TEXT,
    "direction" TEXT,
    "sender_type" TEXT,
    "content" TEXT,
    "message_type" TEXT,
    "media_url" TEXT,
    "mime_type" TEXT,
    "raw_payload" JSONB,
    "delivery_status" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "message_timestamp" TIMESTAMP(3),
    "company_id" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT,
    "conversation_id" TEXT,
    "contact_id" TEXT,
    "read_by_user_id" TEXT,
    "type" "public"."NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'medium',
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB,
    "description" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" TEXT NOT NULL,
    "full_name" TEXT,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "company_id" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'AGENT',
    "approval_status" "public"."UserApprovalStatus" NOT NULL DEFAULT 'APPROVED',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "event_type" TEXT,
    "external_event_id" TEXT,
    "payload" JSONB,
    "processing_status" TEXT,
    "error_message" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),
    "company_id" TEXT,
    "instance_name" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "agent_registration_requests_approved_user_id_key" ON "public"."agent_registration_requests"("approved_user_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_registration_requests_company_id_idx" ON "public"."agent_registration_requests"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_registration_requests_created_at_idx" ON "public"."agent_registration_requests"("created_at" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_registration_requests_email_idx" ON "public"."agent_registration_requests"("email" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_registration_requests_status_idx" ON "public"."agent_registration_requests"("status" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "agent_registration_requests_user_id_idx" ON "public"."agent_registration_requests"("user_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_runs_company_id_idx" ON "public"."ai_runs"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_runs_contact_id_idx" ON "public"."ai_runs"("contact_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_runs_conversation_id_idx" ON "public"."ai_runs"("conversation_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_actor_user_id_idx" ON "public"."audit_logs"("actor_user_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_company_id_idx" ON "public"."audit_logs"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_entity_type_idx" ON "public"."audit_logs"("entity_type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "companies_email_key" ON "public"."companies"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_key" ON "public"."companies"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_registration_requests_activation_token_key" ON "public"."company_registration_requests"("activation_token" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_registration_requests_business_email_idx" ON "public"."company_registration_requests"("business_email" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_registration_requests_created_at_idx" ON "public"."company_registration_requests"("created_at" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_registration_requests_status_idx" ON "public"."company_registration_requests"("status" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_whatsapp_instances_company_id_idx" ON "public"."company_whatsapp_instances"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "company_whatsapp_instances_connection_status_idx" ON "public"."company_whatsapp_instances"("connection_status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "company_whatsapp_instances_evolution_instance_name_key" ON "public"."company_whatsapp_instances"("evolution_instance_name" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contact_notes_company_id_idx" ON "public"."contact_notes"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_company_id_idx" ON "public"."contacts"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "contacts_phone_idx" ON "public"."contacts"("phone" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversation_tags_company_id_idx" ON "public"."conversation_tags"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_company_id_idx" ON "public"."conversations"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_contact_id_idx" ON "public"."conversations"("contact_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_articles_company_id_idx" ON "public"."kb_articles"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_articles_source_idx" ON "public"."kb_articles"("source" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_articles_status_idx" ON "public"."kb_articles"("status" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_chunks_company_id_idx" ON "public"."kb_chunks"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_suggestions_company_id_idx" ON "public"."kb_suggestions"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_suggestions_conversation_id_idx" ON "public"."kb_suggestions"("conversation_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_suggestions_customer_message_id_idx" ON "public"."kb_suggestions"("customer_message_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_suggestions_human_answer_message_id_idx" ON "public"."kb_suggestions"("human_answer_message_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_suggestions_status_idx" ON "public"."kb_suggestions"("status" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_company_id_idx" ON "public"."messages"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "public"."messages"("conversation_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_external_message_id_idx" ON "public"."messages"("external_message_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_company_id_idx" ON "public"."notifications"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "public"."notifications"("created_at" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "public"."notifications"("is_read" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "public"."notifications"("type" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "settings_company_id_idx" ON "public"."settings"("company_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "settings_key_key" ON "public"."settings"("key" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_company_id_idx" ON "public"."subscriptions"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "public"."subscriptions"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "unique_email" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_company_id_idx" ON "public"."users"("company_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "public"."users"("role" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_events_company_id_idx" ON "public"."webhook_events"("company_id" ASC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_events_instance_name_idx" ON "public"."webhook_events"("instance_name" ASC);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_registration_requests_approved_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."agent_registration_requests"
      ADD CONSTRAINT "agent_registration_requests_approved_user_id_fkey"
      FOREIGN KEY ("approved_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_registration_requests_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."agent_registration_requests"
      ADD CONSTRAINT "agent_registration_requests_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_registration_requests_reviewed_by_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."agent_registration_requests"
      ADD CONSTRAINT "agent_registration_requests_reviewed_by_user_id_fkey"
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_registration_requests_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."agent_registration_requests"
      ADD CONSTRAINT "agent_registration_requests_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."ai_runs"
      ADD CONSTRAINT "ai_runs_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_contact_id_fkey'
  ) THEN
    ALTER TABLE "public"."ai_runs"
      ADD CONSTRAINT "ai_runs_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_runs_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."ai_runs"
      ADD CONSTRAINT "ai_runs_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_actor_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."audit_logs"
      ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."audit_logs"
      ADD CONSTRAINT "audit_logs_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_registration_requests_approved_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."company_registration_requests"
      ADD CONSTRAINT "company_registration_requests_approved_company_id_fkey"
      FOREIGN KEY ("approved_company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_registration_requests_reviewed_by_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."company_registration_requests"
      ADD CONSTRAINT "company_registration_requests_reviewed_by_user_id_fkey"
      FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'company_whatsapp_instances_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."company_whatsapp_instances"
      ADD CONSTRAINT "company_whatsapp_instances_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_notes_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."contact_notes"
      ADD CONSTRAINT "contact_notes_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_notes_contact_id_fkey'
  ) THEN
    ALTER TABLE "public"."contact_notes"
      ADD CONSTRAINT "contact_notes_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."contacts"
      ADD CONSTRAINT "contacts_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_tags_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."conversation_tags"
      ADD CONSTRAINT "conversation_tags_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversation_tags_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."conversation_tags"
      ADD CONSTRAINT "conversation_tags_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."conversations"
      ADD CONSTRAINT "conversations_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_contact_id_fkey'
  ) THEN
    ALTER TABLE "public"."conversations"
      ADD CONSTRAINT "conversations_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_articles_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_articles"
      ADD CONSTRAINT "kb_articles_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_articles_created_by_fkey'
  ) THEN
    ALTER TABLE "public"."kb_articles"
      ADD CONSTRAINT "kb_articles_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_articles_source_contact_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_articles"
      ADD CONSTRAINT "kb_articles_source_contact_id_fkey"
      FOREIGN KEY ("source_contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_articles_source_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_articles"
      ADD CONSTRAINT "kb_articles_source_conversation_id_fkey"
      FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_chunks_article_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_chunks"
      ADD CONSTRAINT "kb_chunks_article_id_fkey"
      FOREIGN KEY ("article_id") REFERENCES "public"."kb_articles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_chunks_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_chunks"
      ADD CONSTRAINT "kb_chunks_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_created_by_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_customer_message_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_customer_message_id_fkey"
      FOREIGN KEY ("customer_message_id") REFERENCES "public"."messages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_human_answer_message_id_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_human_answer_message_id_fkey"
      FOREIGN KEY ("human_answer_message_id") REFERENCES "public"."messages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kb_suggestions_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "public"."kb_suggestions"
      ADD CONSTRAINT "kb_suggestions_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."messages"
      ADD CONSTRAINT "messages_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."messages"
      ADD CONSTRAINT "messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_contact_id_fkey'
  ) THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_conversation_id_fkey'
  ) THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notifications_read_by_user_id_fkey'
  ) THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_read_by_user_id_fkey"
      FOREIGN KEY ("read_by_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."settings"
      ADD CONSTRAINT "settings_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."subscriptions"
      ADD CONSTRAINT "subscriptions_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."users"
      ADD CONSTRAINT "users_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'webhook_events_company_id_fkey'
  ) THEN
    ALTER TABLE "public"."webhook_events"
      ADD CONSTRAINT "webhook_events_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
