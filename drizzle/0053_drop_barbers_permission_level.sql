-- Drop legacy barbers.permission_level. Replaced by user.role + isManager +
-- managerPermissions (#72). Verified zero auth checks read this column.
ALTER TABLE "barbers" DROP COLUMN IF EXISTS "permission_level";
