# Database migrations

Agendalo uses [Drizzle ORM](https://orm.drizzle.team/) with Neon Postgres. The
schema lives in `src/db/schema.ts` and every change must be captured as a
versioned SQL migration under `drizzle/`.

## Day-to-day workflow

1. Edit `src/db/schema.ts`.
2. Generate the migration:
   ```bash
   npx drizzle-kit generate
   ```
   Drizzle writes a new `drizzle/NNNN_*.sql` file plus a snapshot in
   `drizzle/meta/`.
3. **Read the SQL**. Always. Drizzle is good but not always smart about
   renames, defaults, or destructive column drops. Fix it by hand if it's off.
4. Apply to production:
   ```bash
   DATABASE_URL="<prod-url>" npx drizzle-kit migrate
   ```
5. Commit both the schema change and the generated files in the same PR.

## Baseline migration (one-off, only done once)

`drizzle/0000_milky_donald_blake.sql` is the **initial baseline**. It was
generated from the current `src/db/schema.ts` at a point when the production
database already had every table created via ad-hoc `drizzle-kit push` calls.

Running `drizzle-kit migrate` against production now would try to
`CREATE TABLE` tables that already exist and fail. Before the first
`migrate` run, mark the baseline as already-applied in production:

```sql
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at BIGINT
);

-- Use the hash from drizzle/meta/_journal.json for tag "0000_milky_donald_blake"
INSERT INTO "__drizzle_migrations" (hash, created_at)
VALUES ('<hash-from-journal>', <timestamp-from-journal>);
```

After that, `drizzle-kit migrate` will skip `0000` and only apply `0001+`.

If the schema ever drifts from the baseline (a column was pushed via
`drizzle-kit push` but not captured in a migration), fix it by:

1. `drizzle-kit generate` to produce a migration that represents the diff.
2. Run it against prod.
3. Confirm `src/db/schema.ts` is the single source of truth.

## Never in production

- Do not run `drizzle-kit push` against the production database. It mutates
  without any migration record and is impossible to review.
- Do not hand-edit existing committed migration files; add a new one.
- Do not skip the `generate` step and rely only on `push`.

## Rolling back

Drizzle does not auto-generate down-migrations. If a migration goes wrong,
write a compensating forward migration (new file) that reverts the change.
