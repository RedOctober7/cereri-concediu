-- Regulile „Durată maximă a unei cereri” și „Absențe simultane în echipă” au fost
-- scoase din aplicație: întâi ștergem rândurile lor, apoi valorile din enum.
DELETE FROM "Constraint" WHERE "type" IN ('MAX_CONCURRENT_PERCENT', 'MAX_CONSECUTIVE_DAYS');

-- AlterEnum
BEGIN;
CREATE TYPE "ConstraintType_new" AS ENUM ('MIN_NOTICE_DAYS', 'BLACKOUT_MONTH', 'MIN_ONE_VACATION_OF_N_DAYS');
ALTER TABLE "Constraint" ALTER COLUMN "type" TYPE "ConstraintType_new" USING ("type"::text::"ConstraintType_new");
ALTER TYPE "ConstraintType" RENAME TO "ConstraintType_old";
ALTER TYPE "ConstraintType_new" RENAME TO "ConstraintType";
DROP TYPE "public"."ConstraintType_old";
COMMIT;
