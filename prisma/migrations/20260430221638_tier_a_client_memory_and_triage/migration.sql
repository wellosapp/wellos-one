-- CreateEnum
CREATE TYPE "ClientNoteCategory" AS ENUM ('general', 'preference', 'formula', 'allergy', 'medical', 'clinical', 'behavioral', 'billing', 'relationship', 'internal', 'session', 'customer_request');

-- CreateEnum
CREATE TYPE "ClientNotePriority" AS ENUM ('normal', 'alert');

-- CreateEnum
CREATE TYPE "ClientNoteAuthorType" AS ENUM ('customer', 'staff', 'admin', 'system');

-- CreateEnum
CREATE TYPE "ClientNoteSourceSurface" AS ENUM ('public_booking', 'magic_link_manage', 'appointment_detail', 'calendar_drawer', 'client_profile', 'intake_form', 'system_transition');

-- CreateEnum
CREATE TYPE "ClientNoteVisibility" AS ENUM ('location', 'provider_only', 'admin_only', 'customer_submitted', 'protected_clinical');

-- CreateEnum
CREATE TYPE "ClientFileVisibility" AS ENUM ('location', 'provider_only', 'admin_only');

-- CreateEnum
CREATE TYPE "ClientNoteAlertTrigger" AS ENUM ('booking', 'check_in', 'checkout');

-- CreateEnum
CREATE TYPE "ClientNoteAckTriggerContext" AS ENUM ('booking', 'check_in', 'checkout', 'manual');

-- CreateEnum
CREATE TYPE "ServiceBookingQuestionType" AS ENUM ('chips_single', 'chips_multi', 'short_text', 'long_text', 'slider', 'yes_no', 'photo_upload');

-- CreateEnum
CREATE TYPE "ServiceContentDeliveryType" AS ENUM ('prep', 'aftercare', 'reminder_with_content');

-- CreateEnum
CREATE TYPE "ServiceContentDeliveryChannel" AS ENUM ('sms', 'email', 'both');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('web', 'staff', 'widget', 'api', 'import', 'campaign', 'walk_in', 'quick_book');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "source" "AppointmentSource";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "banned_at" TIMESTAMPTZ(3),
ADD COLUMN     "banned_reason" TEXT,
ADD COLUMN     "email_opted_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferred_channel" TEXT,
ADD COLUMN     "sms_opted_out" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "aftercare_markdown" TEXT,
ADD COLUMN     "prep_instructions_markdown" TEXT,
ADD COLUMN     "what_to_expect_markdown" TEXT;

-- CreateTable
CREATE TABLE "client_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "category" "ClientNoteCategory" NOT NULL,
    "priority" "ClientNotePriority" NOT NULL DEFAULT 'normal',
    "title" TEXT,
    "body" TEXT NOT NULL,
    "appointment_id" TEXT,
    "service_id" TEXT,
    "author_type" "ClientNoteAuthorType" NOT NULL,
    "author_staff_id" TEXT,
    "author_client_id" TEXT,
    "author_user_id" TEXT,
    "source_surface" "ClientNoteSourceSurface" NOT NULL,
    "visibility" "ClientNoteVisibility" NOT NULL,
    "customer_visible" BOOLEAN NOT NULL DEFAULT false,
    "alert_triggers" "ClientNoteAlertTrigger"[] NOT NULL DEFAULT ARRAY[]::"ClientNoteAlertTrigger"[],
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_files" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "appointment_id" TEXT,
    "service_id" TEXT,
    "note_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "uploaded_by_staff_id" TEXT,
    "uploaded_by_client" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "ClientFileVisibility" NOT NULL,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "client_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soap_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "author_staff_id" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "additional_notes" TEXT,
    "template_id" TEXT,
    "icd_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cpt_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "soap_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soap_note_revisions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "additional_notes" TEXT,
    "revised_by_staff_id" TEXT NOT NULL,
    "revision_reason" TEXT NOT NULL,
    "revised_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soap_note_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_note_acknowledgments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "trigger_context" "ClientNoteAckTriggerContext" NOT NULL,
    "appointment_id" TEXT,
    "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_note_acknowledgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_booking_questions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "question_key" TEXT NOT NULL,
    "question_label" TEXT NOT NULL,
    "helper_text" TEXT,
    "question_type" "ServiceBookingQuestionType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_gating" BOOLEAN NOT NULL DEFAULT false,
    "gating_rule" JSONB,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_booking_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_booking_answers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_key_snapshot" TEXT NOT NULL,
    "question_label_snapshot" TEXT NOT NULL,
    "question_type_snapshot" "ServiceBookingQuestionType" NOT NULL,
    "answer_value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_booking_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_content_deliveries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "delivery_type" "ServiceContentDeliveryType" NOT NULL,
    "channel" "ServiceContentDeliveryChannel" NOT NULL,
    "schedule_offset_minutes" INTEGER NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "template_override_markdown" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "service_content_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_notes_tenant_id_idx" ON "client_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "client_notes_tenant_id_deleted_at_idx" ON "client_notes"("tenant_id", "deleted_at");

-- CreateIndex
-- Partial index per Q4 2026-04-30: restrict to active (non-archived,
-- non-soft-deleted) notes. Postgres rejects NOW() in index predicates so
-- the expires_at filter happens at query time in the app layer.
CREATE INDEX "client_notes_client_id_category_idx" ON "client_notes"("client_id", "category")
  WHERE "archived_at" IS NULL AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "client_notes_appointment_id_idx" ON "client_notes"("appointment_id");

-- CreateIndex
CREATE INDEX "client_notes_service_id_idx" ON "client_notes"("service_id");

-- CreateIndex
-- Partial index per master spec §5.2.3: alert-priority lookups by client.
-- Restricted to alert + active rows so the index stays small (most notes
-- are normal priority).
CREATE INDEX "client_notes_client_id_priority_idx" ON "client_notes"("client_id", "priority")
  WHERE "priority" = 'alert' AND "archived_at" IS NULL AND "deleted_at" IS NULL;

-- CreateIndex
CREATE INDEX "client_files_tenant_id_idx" ON "client_files"("tenant_id");

-- CreateIndex
CREATE INDEX "client_files_tenant_id_deleted_at_idx" ON "client_files"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "client_files_client_id_folder_idx" ON "client_files"("client_id", "folder");

-- CreateIndex
CREATE INDEX "client_files_appointment_id_idx" ON "client_files"("appointment_id");

-- CreateIndex
CREATE INDEX "client_files_client_id_uploaded_at_idx" ON "client_files"("client_id", "uploaded_at");

-- CreateIndex
CREATE INDEX "client_files_note_id_idx" ON "client_files"("note_id");

-- CreateIndex
CREATE INDEX "soap_notes_tenant_id_idx" ON "soap_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "soap_notes_tenant_id_deleted_at_idx" ON "soap_notes"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "soap_notes_client_id_created_at_idx" ON "soap_notes"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "soap_notes_appointment_id_idx" ON "soap_notes"("appointment_id");

-- CreateIndex
CREATE INDEX "soap_note_revisions_tenant_id_idx" ON "soap_note_revisions"("tenant_id");

-- CreateIndex
CREATE INDEX "soap_note_revisions_note_id_revised_at_idx" ON "soap_note_revisions"("note_id", "revised_at");

-- CreateIndex
CREATE UNIQUE INDEX "soap_note_revisions_note_id_revision_number_key" ON "soap_note_revisions"("note_id", "revision_number");

-- CreateIndex
CREATE INDEX "client_note_acknowledgments_tenant_id_idx" ON "client_note_acknowledgments"("tenant_id");

-- CreateIndex
CREATE INDEX "client_note_acknowledgments_note_id_acknowledged_at_idx" ON "client_note_acknowledgments"("note_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "client_note_acknowledgments_staff_id_acknowledged_at_idx" ON "client_note_acknowledgments"("staff_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "service_booking_questions_tenant_id_idx" ON "service_booking_questions"("tenant_id");

-- CreateIndex
CREATE INDEX "service_booking_questions_tenant_id_deleted_at_idx" ON "service_booking_questions"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "service_booking_questions_service_id_display_order_idx" ON "service_booking_questions"("service_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "service_booking_questions_service_id_question_key_key" ON "service_booking_questions"("service_id", "question_key");

-- CreateIndex
CREATE INDEX "appointment_booking_answers_tenant_id_idx" ON "appointment_booking_answers"("tenant_id");

-- CreateIndex
CREATE INDEX "appointment_booking_answers_appointment_id_idx" ON "appointment_booking_answers"("appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_booking_answers_appointment_id_question_id_key" ON "appointment_booking_answers"("appointment_id", "question_id");

-- CreateIndex
CREATE INDEX "service_content_deliveries_tenant_id_idx" ON "service_content_deliveries"("tenant_id");

-- CreateIndex
CREATE INDEX "service_content_deliveries_tenant_id_deleted_at_idx" ON "service_content_deliveries"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_content_deliveries_service_id_delivery_type_channel_key" ON "service_content_deliveries"("service_id", "delivery_type", "channel");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_source_scheduled_start_at_idx" ON "appointments"("tenant_id", "source", "scheduled_start_at");

-- CreateIndex
CREATE INDEX "clients_tenant_id_banned_idx" ON "clients"("tenant_id", "banned");

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_staff_id_fkey" FOREIGN KEY ("author_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_client_id_fkey" FOREIGN KEY ("author_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "client_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_files" ADD CONSTRAINT "client_files_uploaded_by_staff_id_fkey" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_author_staff_id_fkey" FOREIGN KEY ("author_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_notes" ADD CONSTRAINT "soap_notes_locked_by_staff_id_fkey" FOREIGN KEY ("locked_by_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_note_revisions" ADD CONSTRAINT "soap_note_revisions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_note_revisions" ADD CONSTRAINT "soap_note_revisions_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "soap_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soap_note_revisions" ADD CONSTRAINT "soap_note_revisions_revised_by_staff_id_fkey" FOREIGN KEY ("revised_by_staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_note_acknowledgments" ADD CONSTRAINT "client_note_acknowledgments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_note_acknowledgments" ADD CONSTRAINT "client_note_acknowledgments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "client_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_note_acknowledgments" ADD CONSTRAINT "client_note_acknowledgments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_note_acknowledgments" ADD CONSTRAINT "client_note_acknowledgments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_questions" ADD CONSTRAINT "service_booking_questions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_booking_questions" ADD CONSTRAINT "service_booking_questions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_booking_answers" ADD CONSTRAINT "appointment_booking_answers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_booking_answers" ADD CONSTRAINT "appointment_booking_answers_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_booking_answers" ADD CONSTRAINT "appointment_booking_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "service_booking_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_content_deliveries" ADD CONSTRAINT "service_content_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_content_deliveries" ADD CONSTRAINT "service_content_deliveries_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
