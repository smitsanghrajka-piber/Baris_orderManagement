-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 hand-written constraints. Appended verbatim to the baseline
-- migration by scripts/build-migration.ts. Every trigger here has an
-- integration test in test/integration/db/triggers.spec.ts that performs the
-- forbidden write with raw SQL and asserts the error.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. audit_log is append-only. The runtime role should additionally be
--    granted INSERT/SELECT only; the trigger is belt-and-braces for managed
--    hosts (Supabase) where the app connects as a privileged role.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (attempted %)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_append_only ON "audit_log";
CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- 2. file rows are immutable in the columns that identify the bytes.
CREATE OR REPLACE FUNCTION file_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'file rows cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
     OR NEW."sha256"   IS DISTINCT FROM OLD."sha256"
     OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes"
     OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType"
     OR NEW."bucket"   IS DISTINCT FROM OLD."bucket" THEN
    RAISE EXCEPTION 'file % is immutable (storageKey/sha256/sizeBytes/mimeType/bucket)', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_file_immutable ON "file";
CREATE TRIGGER trg_file_immutable
  BEFORE UPDATE OR DELETE ON "file"
  FOR EACH ROW EXECUTE FUNCTION file_immutable();

-- 3. specification_version is immutable once approvedAt is set, except the
--    forward-only lifecycle columns. Child colours are frozen too.
CREATE OR REPLACE FUNCTION specification_version_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'specification_version rows cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."approvedAt" IS NOT NULL THEN
    IF to_jsonb(NEW) - 'status' - 'supersededAt' - 'updatedAt'
       IS DISTINCT FROM to_jsonb(OLD) - 'status' - 'supersededAt' - 'updatedAt' THEN
      RAISE EXCEPTION 'specification_version % is approved and immutable; create a new revision', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."status" NOT IN ('APPROVED', 'SUPERSEDED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'approved specification_version % cannot return to %', OLD."id", NEW."status"
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_specification_version_immutable ON "specification_version";
CREATE TRIGGER trg_specification_version_immutable
  BEFORE UPDATE OR DELETE ON "specification_version"
  FOR EACH ROW EXECUTE FUNCTION specification_version_immutable();

CREATE OR REPLACE FUNCTION specification_colour_immutable() RETURNS trigger AS $$
DECLARE
  spec_id text;
  approved timestamptz;
BEGIN
  spec_id := COALESCE(NEW."specificationId", OLD."specificationId");
  SELECT "approvedAt" INTO approved FROM "specification_version" WHERE "id" = spec_id;
  IF approved IS NOT NULL THEN
    RAISE EXCEPTION 'colours of approved specification_version % are immutable', spec_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_specification_colour_immutable ON "specification_colour";
CREATE TRIGGER trg_specification_colour_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON "specification_colour"
  FOR EACH ROW EXECUTE FUNCTION specification_colour_immutable();

-- 4. Exactly one APPROVED specification per SKU.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_specification_version_one_approved_per_sku"
  ON "specification_version" ("skuId") WHERE "status" = 'APPROVED';

-- 5. At most one default site per customer.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_site_one_default"
  ON "customer_site" ("customerId") WHERE "isDefault" = true AND "archivedAt" IS NULL;

-- 6. Actor consistency checks (at most one principal; actor type agrees).
ALTER TABLE "file" DROP CONSTRAINT IF EXISTS "chk_file_actor";
ALTER TABLE "file" ADD CONSTRAINT "chk_file_actor" CHECK (
  ("uploadedByActorType" = 'STAFF'    AND "uploadedByUserId" IS NOT NULL AND "uploadedByCustomerUserId" IS NULL) OR
  ("uploadedByActorType" = 'CUSTOMER' AND "uploadedByCustomerUserId" IS NOT NULL AND "uploadedByUserId" IS NULL) OR
  ("uploadedByActorType" IN ('SYSTEM','MES') AND "uploadedByUserId" IS NULL AND "uploadedByCustomerUserId" IS NULL)
);

ALTER TABLE "refresh_token" DROP CONSTRAINT IF EXISTS "chk_refresh_token_principal";
ALTER TABLE "refresh_token" ADD CONSTRAINT "chk_refresh_token_principal"
  CHECK (("userId" IS NULL) <> ("customerUserId" IS NULL));

ALTER TABLE "password_reset_token" DROP CONSTRAINT IF EXISTS "chk_password_reset_token_principal";
ALTER TABLE "password_reset_token" ADD CONSTRAINT "chk_password_reset_token_principal"
  CHECK (("userId" IS NULL) <> ("customerUserId" IS NULL));

ALTER TABLE "notification" DROP CONSTRAINT IF EXISTS "chk_notification_principal";
ALTER TABLE "notification" ADD CONSTRAINT "chk_notification_principal"
  CHECK (("userId" IS NULL) <> ("customerUserId" IS NULL));

ALTER TABLE "notification_preference" DROP CONSTRAINT IF EXISTS "chk_notification_preference_principal";
ALTER TABLE "notification_preference" ADD CONSTRAINT "chk_notification_preference_principal"
  CHECK (("userId" IS NULL) <> ("customerUserId" IS NULL));

-- 7. Tenant consistency: a portal user's linked contact must belong to the
--    same customer; a SKU's current specification must belong to that SKU;
--    a spec's die-line file must be tagged with the SKU's customer (or be
--    internal); customer-owned tooling referenced by a spec must belong to
--    the SKU's customer.
CREATE OR REPLACE FUNCTION same_tenant_customer_user() RETURNS trigger AS $$
DECLARE
  contact_customer text;
BEGIN
  IF NEW."contactId" IS NOT NULL THEN
    SELECT "customerId" INTO contact_customer FROM "customer_contact" WHERE "id" = NEW."contactId";
    IF contact_customer IS DISTINCT FROM NEW."customerId" THEN
      RAISE EXCEPTION 'TENANT_MISMATCH: contact % belongs to a different customer', NEW."contactId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_same_tenant_customer_user ON "customer_user";
CREATE TRIGGER trg_same_tenant_customer_user
  BEFORE INSERT OR UPDATE ON "customer_user"
  FOR EACH ROW EXECUTE FUNCTION same_tenant_customer_user();

CREATE OR REPLACE FUNCTION same_sku_current_specification() RETURNS trigger AS $$
DECLARE
  spec_sku text;
BEGIN
  IF NEW."currentSpecificationId" IS NOT NULL THEN
    SELECT "skuId" INTO spec_sku FROM "specification_version" WHERE "id" = NEW."currentSpecificationId";
    IF spec_sku IS DISTINCT FROM NEW."id" THEN
      RAISE EXCEPTION 'specification % does not belong to sku %', NEW."currentSpecificationId", NEW."id"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_same_sku_current_specification ON "customer_sku";
CREATE TRIGGER trg_same_sku_current_specification
  BEFORE INSERT OR UPDATE ON "customer_sku"
  FOR EACH ROW EXECUTE FUNCTION same_sku_current_specification();

CREATE OR REPLACE FUNCTION same_tenant_specification_version() RETURNS trigger AS $$
DECLARE
  sku_customer text;
  other_customer text;
  owner text;
BEGIN
  SELECT "customerId" INTO sku_customer FROM "customer_sku" WHERE "id" = NEW."skuId";
  IF NEW."dieLineFileId" IS NOT NULL THEN
    SELECT "customerId" INTO other_customer FROM "file" WHERE "id" = NEW."dieLineFileId";
    IF other_customer IS NOT NULL AND other_customer IS DISTINCT FROM sku_customer THEN
      RAISE EXCEPTION 'TENANT_MISMATCH: die-line file % belongs to a different customer', NEW."dieLineFileId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW."toolId" IS NOT NULL THEN
    SELECT "ownedBy", "customerId" INTO owner, other_customer FROM "tool" WHERE "id" = NEW."toolId";
    IF owner = 'CUSTOMER' AND other_customer IS DISTINCT FROM sku_customer THEN
      RAISE EXCEPTION 'TENANT_MISMATCH: tool % is owned by a different customer', NEW."toolId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  IF NEW."plateSetId" IS NOT NULL THEN
    SELECT "ownedBy", "customerId" INTO owner, other_customer FROM "plate_set" WHERE "id" = NEW."plateSetId";
    IF owner = 'CUSTOMER' AND other_customer IS DISTINCT FROM sku_customer THEN
      RAISE EXCEPTION 'TENANT_MISMATCH: plate set % is owned by a different customer', NEW."plateSetId"
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_same_tenant_specification_version ON "specification_version";
CREATE TRIGGER trg_same_tenant_specification_version
  BEFORE INSERT OR UPDATE ON "specification_version"
  FOR EACH ROW EXECUTE FUNCTION same_tenant_specification_version();

-- 8. Trigram search support (Phase 7 uses it; cheap to have from day one).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "idx_customer_name_trgm" ON "customer" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_customer_sku_description_trgm" ON "customer_sku" USING gin ("description" gin_trgm_ops);
