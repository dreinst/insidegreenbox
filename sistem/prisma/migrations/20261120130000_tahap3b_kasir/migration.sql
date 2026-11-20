-- AlterTable
ALTER TABLE "sale" ADD COLUMN     "member_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "svc_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
ADD COLUMN     "void_approved_by" INTEGER;

-- AlterTable
ALTER TABLE "sale_line" ADD COLUMN     "category" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "shift" ADD COLUMN     "approval_note" TEXT,
ADD COLUMN     "closed_by" INTEGER,
ADD COLUMN     "diff_limit" BIGINT;

