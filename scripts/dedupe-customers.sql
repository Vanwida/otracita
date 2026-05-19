-- =============================================================================
-- dedupe-customers.sql — one-off prod data cleanup. NOT a drizzle migration.
--
-- WHAT THIS DOES
--   The same human was split into multiple `customers` rows because the phone
--   was stored in whatever shape it arrived (644… / +34644… / 34644… / 0034…).
--   The write-path canonicalization fix (src/lib/phone.ts, branch fix-identity)
--   stops NEW fragmentation. This script collapses the EXISTING duplicates that
--   were created before that fix shipped.
--
--   For each (client_id, canonical_phone) collision group it:
--     1. Picks a WINNER row: most total_bookings, tiebreak oldest created_at,
--        final tiebreak id ASC (deterministic).
--     2. Re-points the ONLY hard FK (loyalty_ledger.customer_id) loser→winner.
--     3. Rewrites customer_phone → canonical on the 8 phone-keyed tables
--        (bookings, invoices, product_sales, promo_pushes, ratings, tips,
--        waitlist, conversations) — these have NO FK to customers.id, they
--        link by the phone STRING, so once the phone is canonical the rows
--        automatically belong to the surviving canonical customer.
--     4. Canonicalizes the WINNER's own phone (and every non-canonical
--        singleton too) so the whole table is consistent.
--     5. Collapses duplicate conversations rows that now collide on
--        (client_id, canonical_phone) — keeps the most recently updated.
--     6. Backfills winner name/email from a loser ONLY when the winner's is
--        NULL (never overwrites a value the barber set).
--     7. RECOMPUTES winner total_bookings / no_shows / cancellations from the
--        now-unified bookings (does NOT naively sum stale denormalized
--        counters — those were unreliable, that's part of the bug).
--     8. Deletes the loser customer rows LAST (after the FK re-point).
--
-- DRY-RUN EXPECTATION (validated read-only against prod 2026-05-19; the
-- duplicates are the developer's own TEST clients in ONE tenant — low stakes,
-- but cleaned properly):
--     customers              24 → 21   (3 rows collapse)
--     duplicate groups       2         (both in the same client_id)
--       · "Kate"  ****0445   2 → 1     (4 bookings; 0 ratings/tips/loyalty)
--       · "Alex"  ****8663   3 → 1     (the reported 644288663 case;
--                                       ~21 bookings, 2 cancellations;
--                                       0 ratings/tips/loyalty)
--   Re-running after success is a NO-OP (no non-canonical collision groups
--   remain → merge_map is empty → every statement matches 0 rows).
--
-- STATUS: REVIEWED, NOT APPLIED. The team lead executes this via the secure
-- prod process WITH a pg_dump backup of `customers` + the 9 dependent tables
-- taken immediately before. Idempotent + wrapped in a single transaction:
-- any error aborts with zero changes.
--
-- The canonicalization CASE below replicates src/lib/phone.ts for Spanish
-- numbers (the only fragmentation that occurs in this all-Spanish dataset):
-- strip non-digits, 00→+, +34<9d>/34<9d>/0034<9d>/<9d> → +34<9d>, keep an
-- already-+<digits> number, otherwise keep the raw value (matches the util's
-- "invalid → keep raw" fallback so nothing is lost).
-- =============================================================================

BEGIN;

-- Reusable canonicalization as a temp view over customers. ----------------------
CREATE TEMP TABLE _canon ON COMMIT DROP AS
SELECT
  cu.id,
  cu.client_id,
  cu.phone,
  cu.name,
  cu.email,
  cu.total_bookings,
  cu.created_at,
  CASE
    WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^00(\d{2,})$'
      THEN '+' || regexp_replace(regexp_replace(cu.phone, '[^0-9]', '', 'g'), '^00', '')
    WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^0034(\d{9})$'
      THEN '+34' || right(regexp_replace(cu.phone, '[^0-9]', '', 'g'), 9)
    WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^34(\d{9})$'
      THEN '+34' || right(regexp_replace(cu.phone, '[^0-9]', '', 'g'), 9)
    WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^(\d{9})$'
      THEN '+34' || regexp_replace(cu.phone, '[^0-9]', '', 'g')
    WHEN (cu.phone ~ '^\s*\+')
         AND regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^\d{6,15}$'
      THEN '+' || regexp_replace(cu.phone, '[^0-9]', '', 'g')
    ELSE cu.phone
  END AS canonical
FROM customers cu;

-- Rank rows within each collision group; row 1 = WINNER. ------------------------
CREATE TEMP TABLE _ranked ON COMMIT DROP AS
SELECT
  c.*,
  row_number() OVER (
    PARTITION BY c.client_id, c.canonical
    ORDER BY c.total_bookings DESC NULLS LAST, c.created_at ASC, c.id ASC
  ) AS rn,
  count(*) OVER (PARTITION BY c.client_id, c.canonical) AS grp_size
FROM _canon c;

-- merge_map: every LOSER (rn > 1) mapped to its winner. Empty after a clean run
-- (no collision groups left) → all subsequent statements are no-ops.
CREATE TEMP TABLE _merge_map ON COMMIT DROP AS
SELECT
  l.id          AS loser_id,
  w.id          AS winner_id,
  l.client_id   AS client_id,
  l.phone       AS old_phone,
  l.canonical   AS canonical,
  l.name        AS loser_name,
  l.email       AS loser_email
FROM _ranked l
JOIN _ranked w
  ON w.client_id = l.client_id
 AND w.canonical = l.canonical
 AND w.rn = 1
WHERE l.rn > 1
  AND l.grp_size > 1;

-- 1. Re-point the ONLY hard FK before deleting losers (FK is NO ACTION). --------
UPDATE loyalty_ledger l
   SET customer_id = m.winner_id
  FROM _merge_map m
 WHERE l.customer_id = m.loser_id;

-- 2. Rewrite the denormalized customer_phone on every phone-keyed table so the
--    history follows the canonical customer. Scoped by (client_id, old_phone)
--    — multi-tenant safe (never touches another tenant's identical number).
UPDATE bookings      t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE invoices      t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE product_sales t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE promo_pushes  t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE ratings       t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE tips          t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE waitlist      t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;
UPDATE conversations t SET customer_phone = m.canonical FROM _merge_map m
  WHERE t.client_id = m.client_id AND t.customer_phone = m.old_phone;

-- 3. Canonicalize EVERY non-canonical customer row (winners + lonely singletons
--    with a non-canonical format). Losers get deleted in step 8 anyway; this
--    leaves the survivors holding the exact canonical string.
UPDATE customers cu
   SET phone = r.canonical
  FROM _ranked r
 WHERE cu.id = r.id
   AND cu.phone <> r.canonical;

-- 4. Conversations collision collapse. After step 2 several conversation rows
--    can share (client_id, customer_phone) (each fragmented identity had its
--    own thread). The bot's getOrCreateConversation reads [0], so duplicates
--    are ambiguous. Keep the most recently ACTIVE thread per (client,phone)
--    — conversations has no updated_at; `last_interaction` (NOT NULL, set on
--    every bot turn) is the correct recency key. Delete the rest.
--    (Dry-run: all colliding rows were step='idle' → no live flow lost.)
DELETE FROM conversations c
 USING conversations keep
 WHERE c.client_id = keep.client_id
   AND c.customer_phone = keep.customer_phone
   AND c.id <> keep.id
   AND (
     keep.last_interaction > c.last_interaction
     OR (keep.last_interaction = c.last_interaction AND keep.id > c.id)
   );

-- 5. Backfill winner name/email from a loser ONLY if the winner's is NULL.
--    Never overwrites a value the barber set. Picks the loser deterministically
--    (lowest loser_id) when several could supply it.
UPDATE customers w
   SET name = src.loser_name
  FROM (
    SELECT DISTINCT ON (winner_id) winner_id, loser_name
      FROM _merge_map
     WHERE loser_name IS NOT NULL AND btrim(loser_name) <> ''
     ORDER BY winner_id, loser_id
  ) src
 WHERE w.id = src.winner_id
   AND (w.name IS NULL OR btrim(w.name) = '');

UPDATE customers w
   SET email = src.loser_email
  FROM (
    SELECT DISTINCT ON (winner_id) winner_id, loser_email
      FROM _merge_map
     WHERE loser_email IS NOT NULL AND btrim(loser_email) <> ''
     ORDER BY winner_id, loser_id
  ) src
 WHERE w.id = src.winner_id
   AND (w.email IS NULL OR btrim(w.email) = '');

-- 6. RECOMPUTE winner counters from the now-unified bookings. The stale
--    denormalized counters on the fragmented rows were unreliable (part of
--    the original bug) — derive the truth instead of summing them.
UPDATE customers w
   SET total_bookings = agg.total,
       no_shows       = agg.no_show,
       cancellations  = agg.cancelled,
       last_booking_at = agg.last_at
  FROM (
    SELECT
      cu.id AS customer_id,
      count(b.*)                                                   AS total,
      count(b.*) FILTER (WHERE b.status = 'no_show')               AS no_show,
      count(b.*) FILTER (WHERE b.status = 'cancelled')             AS cancelled,
      max(b.created_at)                                            AS last_at
    FROM customers cu
    JOIN bookings b
      ON b.client_id = cu.client_id
     AND b.customer_phone = cu.phone
    WHERE cu.id IN (SELECT DISTINCT winner_id FROM _merge_map)
    GROUP BY cu.id
  ) agg
 WHERE w.id = agg.customer_id;

-- 7. Delete the loser customer rows LAST (loyalty_ledger already re-pointed).
DELETE FROM customers cu
 WHERE cu.id IN (SELECT loser_id FROM _merge_map);

-- 8. POST-CONDITION GUARD — abort the whole transaction if any duplicate
--    (client_id, canonical_phone) group still exists. Belt-and-suspenders:
--    a non-empty result here means the merge did not fully collapse and we
--    must NOT commit a half-deduped state.
DO $$
DECLARE
  remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM (
    SELECT 1
      FROM customers cu
     GROUP BY
       cu.client_id,
       CASE
         WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^00(\d{2,})$'
           THEN '+' || regexp_replace(regexp_replace(cu.phone, '[^0-9]', '', 'g'), '^00', '')
         WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^0034(\d{9})$'
           THEN '+34' || right(regexp_replace(cu.phone, '[^0-9]', '', 'g'), 9)
         WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^34(\d{9})$'
           THEN '+34' || right(regexp_replace(cu.phone, '[^0-9]', '', 'g'), 9)
         WHEN regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^(\d{9})$'
           THEN '+34' || regexp_replace(cu.phone, '[^0-9]', '', 'g')
         WHEN (cu.phone ~ '^\s*\+')
              AND regexp_replace(cu.phone, '[^0-9]', '', 'g') ~ '^\d{6,15}$'
           THEN '+' || regexp_replace(cu.phone, '[^0-9]', '', 'g')
         ELSE cu.phone
       END
     HAVING count(*) > 1
  ) g;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'dedupe-customers: % duplicate group(s) still present — aborting, transaction rolled back', remaining;
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- RECOMMENDED FOLLOW-UP (separate drizzle migration, NOT here): once this
-- script has run cleanly and the write-path canonicalization is deployed,
-- add a hard guard so fragmentation can never recur:
--
--   CREATE UNIQUE INDEX IF NOT EXISTS customers_client_phone_uniq
--     ON customers (client_id, phone);
--
-- It is only safe AFTER this dedupe (the post-condition guard above proves
-- zero collision groups remain).
-- =============================================================================
