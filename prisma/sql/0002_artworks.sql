-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3 (artwork review) hand-written constraints. Appended to the
-- artworks migration by scripts/build-migration.ts. Each trigger is covered in
-- test/integration/artworks/artwork-review.spec.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. artwork_approval is append-only evidence of what the customer decided.
CREATE OR REPLACE FUNCTION artwork_approval_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'artwork_approval is append-only (attempted %)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artwork_approval_append_only ON "artwork_approval";
CREATE TRIGGER trg_artwork_approval_append_only
  BEFORE UPDATE OR DELETE ON "artwork_approval"
  FOR EACH ROW EXECUTE FUNCTION artwork_approval_append_only();

-- 2. artwork files are immutable, and none can be added to or removed from a
--    version once its proof has been sent (lockedAt set).
CREATE OR REPLACE FUNCTION artwork_file_guard() RETURNS trigger AS $$
DECLARE
  locked timestamp;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'artwork_file rows are immutable' USING ERRCODE = 'restrict_violation';
  END IF;
  SELECT "lockedAt" INTO locked FROM "artwork_version"
   WHERE "id" = (CASE WHEN TG_OP = 'DELETE' THEN OLD."versionId" ELSE NEW."versionId" END);
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'artwork version files are immutable once the proof has been sent'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artwork_file_guard ON "artwork_file";
CREATE TRIGGER trg_artwork_file_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "artwork_file"
  FOR EACH ROW EXECUTE FUNCTION artwork_file_guard();

-- 3. a sent version keeps its identity: the customer always sees exactly what
--    was sent. Status, timestamps and summaries may still move forward.
CREATE OR REPLACE FUNCTION artwork_version_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'artwork versions cannot be deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD."lockedAt" IS NOT NULL AND (
       NEW."artworkId" IS DISTINCT FROM OLD."artworkId"
    OR NEW."revisionNo" IS DISTINCT FROM OLD."revisionNo"
    OR NEW."revisionDescription" IS DISTINCT FROM OLD."revisionDescription"
    OR NEW."customerNotes" IS DISTINCT FROM OLD."customerNotes"
    OR NEW."lockedAt" IS DISTINCT FROM OLD."lockedAt"
    OR NEW."sentAt" IS DISTINCT FROM OLD."sentAt") THEN
    RAISE EXCEPTION 'artwork version % is immutable once the proof has been sent', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artwork_version_immutable ON "artwork_version";
CREATE TRIGGER trg_artwork_version_immutable
  BEFORE UPDATE OR DELETE ON "artwork_version"
  FOR EACH ROW EXECUTE FUNCTION artwork_version_immutable();

-- 4. an artwork's SKU must belong to the same customer.
CREATE OR REPLACE FUNCTION artwork_same_tenant() RETURNS trigger AS $$
DECLARE
  sku_customer text;
BEGIN
  IF NEW."skuId" IS NULL THEN RETURN NEW; END IF;
  SELECT "customerId" INTO sku_customer FROM "customer_sku" WHERE "id" = NEW."skuId";
  IF sku_customer IS DISTINCT FROM NEW."customerId" THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: SKU % does not belong to customer %', NEW."skuId", NEW."customerId"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_artwork_same_tenant ON "artwork";
CREATE TRIGGER trg_artwork_same_tenant
  BEFORE INSERT OR UPDATE OF "skuId", "customerId" ON "artwork"
  FOR EACH ROW EXECUTE FUNCTION artwork_same_tenant();
