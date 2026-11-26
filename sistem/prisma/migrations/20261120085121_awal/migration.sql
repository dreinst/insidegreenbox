-- CreateEnum
CREATE TYPE "doc_status" AS ENUM ('Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Selesai', 'Batal');

-- CreateEnum
CREATE TYPE "pay_status" AS ENUM ('BelumBayar', 'Sebagian', 'Lunas');

-- CreateEnum
CREATE TYPE "progress" AS ENUM ('Belum', 'Sebagian', 'Penuh');

-- CreateEnum
CREATE TYPE "shift_status" AS ENUM ('Buka', 'Tutup', 'PerluPersetujuan');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('Selesai', 'Void');

-- CreateEnum
CREATE TYPE "account_kind" AS ENUM ('Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'HPP', 'Beban');

-- CreateEnum
CREATE TYPE "period_status" AS ENUM ('Terbuka', 'Ditutup');

-- CreateEnum
CREATE TYPE "match_status" AS ENUM ('BelumCocok', 'Cocok');

-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "pin_hash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" INTEGER NOT NULL,
    "menu_code" TEXT NOT NULL,
    "can_view" BOOLEAN NOT NULL DEFAULT false,
    "can_create" BOOLEAN NOT NULL DEFAULT false,
    "can_update" BOOLEAN NOT NULL DEFAULT false,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "can_approve" BOOLEAN NOT NULL DEFAULT false,
    "can_post" BOOLEAN NOT NULL DEFAULT false,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","menu_code")
);

-- CreateTable
CREATE TABLE "feature_switch" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "has_limit" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feature_switch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_feature_switch" (
    "role_id" INTEGER NOT NULL,
    "feature_switch_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "limit_value" BIGINT,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_feature_switch_pkey" PRIMARY KEY ("role_id","feature_switch_id")
);

-- CreateTable
CREATE TABLE "approval_rule" (
    "doc_type" TEXT NOT NULL,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "min_amount" BIGINT,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "approval_rule_pkey" PRIMARY KEY ("doc_type")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER,
    "actor_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "doc_type" TEXT,
    "doc_id" TEXT,
    "summary" TEXT NOT NULL DEFAULT '',
    "before_json" JSONB,
    "after_json" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_sequence" (
    "doc_type" TEXT NOT NULL,
    "period" VARCHAR(4) NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_no" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "doc_sequence_pkey" PRIMARY KEY ("doc_type","period")
);

-- CreateTable
CREATE TABLE "user_session" (
    "id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER,
    "base_unit_id" INTEGER NOT NULL,
    "bom_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'bahan',
    "avg_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "last_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "receipt_tol_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "purchasable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'bahan',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_unit" (
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "factor_to_base" DECIMAL(18,6) NOT NULL,
    "is_purchase" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_unit_pkey" PRIMARY KEY ("product_id","unit_id")
);

-- CreateTable
CREATE TABLE "bom" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER,
    "unit_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'menu',
    "output_qty" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "extra_cost" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_line" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER,
    "qty" DECIMAL(18,3) NOT NULL,
    "waste_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "tol_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,

    CONSTRAINT "bom_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_reason" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER,
    "name" TEXT NOT NULL,
    "applies_to" TEXT NOT NULL DEFAULT 'sesuai',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_reason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" SERIAL NOT NULL,
    "payable_account_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "npwp" TEXT NOT NULL DEFAULT '',
    "credit_days" INTEGER NOT NULL DEFAULT 0,
    "bank_name" TEXT NOT NULL DEFAULT '',
    "bank_account_no" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "required_date" DATE,
    "order_progress" "progress" NOT NULL DEFAULT 'Belum',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "close_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_line" (
    "id" SERIAL NOT NULL,
    "purchase_request_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "qty_ordered" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "purchase_request_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expected_date" DATE,
    "receive_progress" "progress" NOT NULL DEFAULT 'Belum',
    "tax_on" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "close_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "purchase_request_line_id" INTEGER,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "qty_received" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "qty_replace" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "is_free" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt" (
    "id" SERIAL NOT NULL,
    "purchase_order_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "delivery_note_no" TEXT NOT NULL DEFAULT '',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "extra_cost" BIGINT NOT NULL DEFAULT 0,
    "invoice_progress" "progress" NOT NULL DEFAULT 'Belum',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goods_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_line" (
    "id" SERIAL NOT NULL,
    "goods_receipt_id" INTEGER NOT NULL,
    "purchase_order_line_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "qty_invoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "qty_returned" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "goods_receipt_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "supplier_invoice_no" TEXT NOT NULL,
    "tax_on" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "price_diff" BIGINT NOT NULL DEFAULT 0,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "pay_status" "pay_status" NOT NULL DEFAULT 'BelumBayar',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_line" (
    "id" SERIAL NOT NULL,
    "purchase_invoice_id" INTEGER NOT NULL,
    "goods_receipt_line_id" INTEGER,
    "goods_receipt_id" INTEGER,
    "product_id" INTEGER,
    "expense_account_id" INTEGER,
    "qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "price" BIGINT NOT NULL DEFAULT 0,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "receipt_value" BIGINT NOT NULL DEFAULT 0,
    "price_diff" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "goods_receipt_id" INTEGER,
    "direct_purchase_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "settle_mode" TEXT NOT NULL DEFAULT 'potong',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "debit_note_amount" BIGINT NOT NULL DEFAULT 0,
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_line" (
    "id" SERIAL NOT NULL,
    "purchase_return_id" INTEGER NOT NULL,
    "goods_receipt_line_id" INTEGER,
    "direct_purchase_line_id" INTEGER,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "qty_uninvoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "qty_invoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "invoice_price" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_return_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_purchase" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "cash_account_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "pay_mode" TEXT NOT NULL DEFAULT 'tunai',
    "supplier_invoice_no" TEXT NOT NULL DEFAULT '',
    "due_date" DATE,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "extra_cost" BIGINT NOT NULL DEFAULT 0,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "pay_status" "pay_status" NOT NULL DEFAULT 'BelumBayar',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "direct_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "direct_purchase_line" (
    "id" SERIAL NOT NULL,
    "direct_purchase_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "unit_id" INTEGER,
    "expense_account_id" INTEGER,
    "qty" DECIMAL(18,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "qty_returned" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "direct_purchase_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payment" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "from_account_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "bank_fee" BIGINT NOT NULL DEFAULT 0,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "unallocated" BIGINT NOT NULL DEFAULT 0,
    "proof_file" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "purchase_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payment_alloc" (
    "id" SERIAL NOT NULL,
    "purchase_payment_id" INTEGER NOT NULL,
    "purchase_invoice_id" INTEGER,
    "direct_purchase_id" INTEGER,
    "purchase_return_id" INTEGER,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "purchase_payment_alloc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "service_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "receipt_header" TEXT NOT NULL DEFAULT '',
    "receipt_footer" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" SERIAL NOT NULL,
    "branch_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'gudang',
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance" (
    "product_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_balance_pkey" PRIMARY KEY ("product_id","location_id")
);

-- CreateTable
CREATE TABLE "stock_ledger" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date" DATE NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "value" BIGINT NOT NULL,
    "balance_qty" DECIMAL(18,3) NOT NULL,
    "avg_cost_after" DECIMAL(18,4) NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_id" INTEGER NOT NULL,
    "line_id" INTEGER,
    "is_reversal" BOOLEAN NOT NULL DEFAULT false,
    "created_by" INTEGER,

    CONSTRAINT "stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_line" (
    "id" SERIAL NOT NULL,
    "stock_adjustment_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "reason_id" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_adjustment_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_opname" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "frozen_at" TIMESTAMPTZ(6),
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_opname_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_opname_line" (
    "id" SERIAL NOT NULL,
    "stock_opname_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "reason_id" INTEGER,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "counted_qty" DECIMAL(18,3),
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_opname_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer" (
    "id" SERIAL NOT NULL,
    "from_location_id" INTEGER NOT NULL,
    "to_location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_line" (
    "id" SERIAL NOT NULL,
    "stock_transfer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "stock_transfer_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "material_location_id" INTEGER NOT NULL,
    "output_location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "planned_qty" DECIMAL(18,3) NOT NULL,
    "produced_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "wip_value" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "close_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_line" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "required_qty" DECIMAL(18,3) NOT NULL,
    "issued_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "returned_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "production_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issue" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'keluar',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "material_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_issue_line" (
    "id" SERIAL NOT NULL,
    "material_issue_id" INTEGER NOT NULL,
    "production_order_line_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "material_issue_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_result" (
    "id" SERIAL NOT NULL,
    "production_order_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "waste_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "value" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "production_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_production" (
    "id" SERIAL NOT NULL,
    "bom_id" INTEGER NOT NULL,
    "from_location_id" INTEGER NOT NULL,
    "to_location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "qty" DECIMAL(18,3) NOT NULL,
    "output_qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "extra_cost" BIGINT NOT NULL DEFAULT 0,
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quick_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quick_production_line" (
    "id" SERIAL NOT NULL,
    "quick_production_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "quick_production_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_tier" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "min_visits" INTEGER NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "perk" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "member_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" SERIAL NOT NULL,
    "tier_id" INTEGER,
    "name" TEXT NOT NULL,
    "wa" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "discount_on" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "open_cash" BIGINT NOT NULL DEFAULT 0,
    "closed_at" TIMESTAMPTZ(6),
    "expected_cash" BIGINT,
    "counted_cash" BIGINT,
    "cash_diff" BIGINT,
    "denominations_json" JSONB,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "shift_status" NOT NULL DEFAULT 'Buka',

    CONSTRAINT "shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_cash_move" (
    "id" SERIAL NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" INTEGER,

    CONSTRAINT "shift_cash_move_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale" (
    "id" SERIAL NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "member_id" INTEGER,
    "no" TEXT NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mode" TEXT NOT NULL,
    "table_no" TEXT,
    "sub" BIGINT NOT NULL DEFAULT 0,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "svc" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "hpp" BIGINT NOT NULL DEFAULT 0,
    "status" "sale_status" NOT NULL DEFAULT 'Selesai',
    "void_by" INTEGER,
    "void_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,
    "created_by" INTEGER,

    CONSTRAINT "sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_line" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "hpp" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sale_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payment" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "paid" BIGINT NOT NULL,
    "change" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "sale_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_settlement" (
    "id" SERIAL NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "to_account_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expected_total" BIGINT NOT NULL DEFAULT 0,
    "actual_total" BIGINT NOT NULL DEFAULT 0,
    "mdr_fee" BIGINT NOT NULL DEFAULT 0,
    "diff" BIGINT NOT NULL DEFAULT 0,
    "proof_file" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos_settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_settlement_line" (
    "id" SERIAL NOT NULL,
    "pos_settlement_id" INTEGER NOT NULL,
    "shift_id" INTEGER NOT NULL,
    "expected" BIGINT NOT NULL DEFAULT 0,
    "actual" BIGINT NOT NULL DEFAULT 0,
    "diff" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "pos_settlement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" SERIAL NOT NULL,
    "parent_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "account_kind" NOT NULL,
    "is_cash_bank" BOOLEAN NOT NULL DEFAULT false,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_mapping" (
    "key" TEXT NOT NULL,
    "account_id" INTEGER NOT NULL,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_mapping_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "fiscal_period" (
    "id" SERIAL NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "stock_closed_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" INTEGER,
    "status" "period_status" NOT NULL DEFAULT 'Terbuka',

    CONSTRAINT "fiscal_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_method" (
    "id" SERIAL NOT NULL,
    "clearing_account_id" INTEGER,
    "deposit_account_id" INTEGER,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tunai',
    "mdr_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "open_drawer" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_account" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_no" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal" (
    "id" SERIAL NOT NULL,
    "period_id" INTEGER,
    "reversal_of_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" INTEGER,
    "memo" TEXT NOT NULL DEFAULT '',
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_line" (
    "id" SERIAL NOT NULL,
    "journal_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "supplier_id" INTEGER,
    "customer_id" INTEGER,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "memo" TEXT NOT NULL DEFAULT '',
    "cleared_at" DATE,

    CONSTRAINT "journal_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transaction" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "to_account_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "party_name" TEXT NOT NULL DEFAULT '',
    "amount" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cash_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transaction_line" (
    "id" SERIAL NOT NULL,
    "cash_transaction_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "cash_transaction_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_line" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "bank_reconcile_id" INTEGER,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT '',
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "balance" BIGINT,
    "import_batch" TEXT NOT NULL,
    "match_status" "match_status" NOT NULL DEFAULT 'BelumCocok',

    CONSTRAINT "bank_statement_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconcile" (
    "id" SERIAL NOT NULL,
    "bank_account_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "stmt_opening" BIGINT NOT NULL DEFAULT 0,
    "stmt_closing" BIGINT NOT NULL DEFAULT 0,
    "book_closing" BIGINT NOT NULL DEFAULT 0,
    "diff" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bank_reconcile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_reconcile_match" (
    "id" SERIAL NOT NULL,
    "bank_statement_line_id" INTEGER NOT NULL,
    "journal_line_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "matched_by" INTEGER,
    "matched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_reconcile_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer" (
    "id" SERIAL NOT NULL,
    "receivable_account_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "payment_days" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "required_date" DATE,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "invoice_progress" "progress" NOT NULL DEFAULT 'Belum',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "close_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_line" (
    "id" SERIAL NOT NULL,
    "sales_order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "qty_invoiced" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "sales_order_id" INTEGER,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "due_date" DATE,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "paid_amount" BIGINT NOT NULL DEFAULT 0,
    "pay_status" "pay_status" NOT NULL DEFAULT 'BelumBayar',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_line" (
    "id" SERIAL NOT NULL,
    "sales_invoice_id" INTEGER NOT NULL,
    "sales_order_line_id" INTEGER,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "disc" BIGINT NOT NULL DEFAULT 0,
    "tax_pct" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "qty_returned" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "to_account_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" BIGINT NOT NULL DEFAULT 0,
    "bank_fee" BIGINT NOT NULL DEFAULT 0,
    "unallocated" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_alloc" (
    "id" SERIAL NOT NULL,
    "customer_payment_id" INTEGER NOT NULL,
    "sales_invoice_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "customer_payment_alloc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return" (
    "id" SERIAL NOT NULL,
    "sales_invoice_id" INTEGER NOT NULL,
    "location_id" INTEGER NOT NULL,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_return_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_line" (
    "id" SERIAL NOT NULL,
    "sales_return_id" INTEGER NOT NULL,
    "sales_invoice_line_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "qty" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_return_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixed_asset" (
    "id" SERIAL NOT NULL,
    "location_id" INTEGER,
    "asset_account_id" INTEGER,
    "accum_account_id" INTEGER,
    "expense_account_id" INTEGER,
    "direct_purchase_line_id" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "acquired_date" DATE NOT NULL,
    "cost" BIGINT NOT NULL,
    "salvage" BIGINT NOT NULL DEFAULT 0,
    "useful_months" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'garis_lurus',
    "book_value" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'aktif',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fixed_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_depreciation" (
    "id" SERIAL NOT NULL,
    "fixed_asset_id" INTEGER NOT NULL,
    "period_id" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'komersial',
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_depreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_disposal" (
    "id" SERIAL NOT NULL,
    "fixed_asset_id" INTEGER NOT NULL,
    "cash_account_id" INTEGER,
    "no" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "proceeds" BIGINT NOT NULL DEFAULT 0,
    "gain_loss" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "asset_disposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "doc_status" NOT NULL DEFAULT 'Draft',
    "submitted_by" INTEGER,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" INTEGER,
    "approved_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "close_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_line" (
    "id" SERIAL NOT NULL,
    "budget_id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "budget_line_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE INDEX "app_user_role_id_idx" ON "app_user"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "feature_switch_code_key" ON "feature_switch"("code");

-- CreateIndex
CREATE INDEX "audit_log_at_idx" ON "audit_log"("at");

-- CreateIndex
CREATE INDEX "audit_log_user_id_at_idx" ON "audit_log"("user_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_action_at_idx" ON "audit_log"("action", "at");

-- CreateIndex
CREATE INDEX "audit_log_doc_type_doc_id_idx" ON "audit_log"("doc_type", "doc_id");

-- CreateIndex
CREATE INDEX "user_session_user_id_idx" ON "user_session"("user_id");

-- CreateIndex
CREATE INDEX "login_attempt_username_at_idx" ON "login_attempt"("username", "at");

-- CreateIndex
CREATE INDEX "login_attempt_ip_at_idx" ON "login_attempt"("ip", "at");

-- CreateIndex
CREATE UNIQUE INDEX "product_code_key" ON "product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "unit_name_key" ON "unit"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bom_code_key" ON "bom"("code");

-- CreateIndex
CREATE INDEX "bom_line_bom_id_idx" ON "bom_line"("bom_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_code_key" ON "supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_no_key" ON "purchase_request"("no");

-- CreateIndex
CREATE INDEX "purchase_request_line_purchase_request_id_idx" ON "purchase_request_line"("purchase_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_no_key" ON "purchase_order"("no");

-- CreateIndex
CREATE INDEX "purchase_order_supplier_id_date_idx" ON "purchase_order"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "purchase_order_line_purchase_order_id_idx" ON "purchase_order_line"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_no_key" ON "goods_receipt"("no");

-- CreateIndex
CREATE INDEX "goods_receipt_purchase_order_id_idx" ON "goods_receipt"("purchase_order_id");

-- CreateIndex
CREATE INDEX "goods_receipt_supplier_id_date_idx" ON "goods_receipt"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "goods_receipt_line_goods_receipt_id_idx" ON "goods_receipt_line"("goods_receipt_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_no_key" ON "purchase_invoice"("no");

-- CreateIndex
CREATE INDEX "purchase_invoice_supplier_id_supplier_invoice_no_idx" ON "purchase_invoice"("supplier_id", "supplier_invoice_no");

-- CreateIndex
CREATE INDEX "purchase_invoice_line_purchase_invoice_id_idx" ON "purchase_invoice_line"("purchase_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_no_key" ON "purchase_return"("no");

-- CreateIndex
CREATE INDEX "purchase_return_line_purchase_return_id_idx" ON "purchase_return_line"("purchase_return_id");

-- CreateIndex
CREATE UNIQUE INDEX "direct_purchase_no_key" ON "direct_purchase"("no");

-- CreateIndex
CREATE INDEX "direct_purchase_supplier_id_date_idx" ON "direct_purchase"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "direct_purchase_line_direct_purchase_id_idx" ON "direct_purchase_line"("direct_purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_payment_no_key" ON "purchase_payment"("no");

-- CreateIndex
CREATE INDEX "purchase_payment_supplier_id_date_idx" ON "purchase_payment"("supplier_id", "date");

-- CreateIndex
CREATE INDEX "purchase_payment_alloc_purchase_payment_id_idx" ON "purchase_payment_alloc"("purchase_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_code_key" ON "branch"("code");

-- CreateIndex
CREATE INDEX "stock_ledger_product_id_location_id_at_idx" ON "stock_ledger"("product_id", "location_id", "at");

-- CreateIndex
CREATE INDEX "stock_ledger_doc_type_doc_id_idx" ON "stock_ledger"("doc_type", "doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustment_no_key" ON "stock_adjustment"("no");

-- CreateIndex
CREATE INDEX "stock_adjustment_line_stock_adjustment_id_idx" ON "stock_adjustment_line"("stock_adjustment_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_opname_no_key" ON "stock_opname"("no");

-- CreateIndex
CREATE INDEX "stock_opname_line_stock_opname_id_idx" ON "stock_opname_line"("stock_opname_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_no_key" ON "stock_transfer"("no");

-- CreateIndex
CREATE INDEX "stock_transfer_line_stock_transfer_id_idx" ON "stock_transfer_line"("stock_transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_no_key" ON "production_order"("no");

-- CreateIndex
CREATE INDEX "production_order_line_production_order_id_idx" ON "production_order_line"("production_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_issue_no_key" ON "material_issue"("no");

-- CreateIndex
CREATE INDEX "material_issue_line_material_issue_id_idx" ON "material_issue_line"("material_issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_result_no_key" ON "production_result"("no");

-- CreateIndex
CREATE UNIQUE INDEX "quick_production_no_key" ON "quick_production"("no");

-- CreateIndex
CREATE INDEX "quick_production_line_quick_production_id_idx" ON "quick_production_line"("quick_production_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_wa_key" ON "member"("wa");

-- CreateIndex
CREATE INDEX "shift_user_id_opened_at_idx" ON "shift"("user_id", "opened_at");

-- CreateIndex
CREATE INDEX "shift_cash_move_shift_id_idx" ON "shift_cash_move"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_no_key" ON "sale"("no");

-- CreateIndex
CREATE INDEX "sale_shift_id_idx" ON "sale"("shift_id");

-- CreateIndex
CREATE INDEX "sale_at_idx" ON "sale"("at");

-- CreateIndex
CREATE INDEX "sale_line_sale_id_idx" ON "sale_line"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payment_sale_id_idx" ON "sale_payment"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_settlement_no_key" ON "pos_settlement"("no");

-- CreateIndex
CREATE INDEX "pos_settlement_line_pos_settlement_id_idx" ON "pos_settlement_line"("pos_settlement_id");

-- CreateIndex
CREATE INDEX "pos_settlement_line_shift_id_idx" ON "pos_settlement_line"("shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_code_key" ON "account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_period_year_month_key" ON "fiscal_period"("year_month");

-- CreateIndex
CREATE UNIQUE INDEX "payment_method_name_key" ON "payment_method"("name");

-- CreateIndex
CREATE UNIQUE INDEX "journal_no_key" ON "journal"("no");

-- CreateIndex
CREATE INDEX "journal_source_type_source_id_idx" ON "journal"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_date_idx" ON "journal"("date");

-- CreateIndex
CREATE INDEX "journal_line_journal_id_idx" ON "journal_line"("journal_id");

-- CreateIndex
CREATE INDEX "journal_line_account_id_idx" ON "journal_line"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transaction_no_key" ON "cash_transaction"("no");

-- CreateIndex
CREATE INDEX "cash_transaction_line_cash_transaction_id_idx" ON "cash_transaction_line"("cash_transaction_id");

-- CreateIndex
CREATE INDEX "bank_statement_line_bank_account_id_date_idx" ON "bank_statement_line"("bank_account_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconcile_no_key" ON "bank_reconcile"("no");

-- CreateIndex
CREATE UNIQUE INDEX "bank_reconcile_match_journal_line_id_key" ON "bank_reconcile_match"("journal_line_id");

-- CreateIndex
CREATE INDEX "bank_reconcile_match_bank_statement_line_id_idx" ON "bank_reconcile_match"("bank_statement_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_code_key" ON "customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_no_key" ON "sales_order"("no");

-- CreateIndex
CREATE INDEX "sales_order_line_sales_order_id_idx" ON "sales_order_line"("sales_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoice_no_key" ON "sales_invoice"("no");

-- CreateIndex
CREATE INDEX "sales_invoice_line_sales_invoice_id_idx" ON "sales_invoice_line"("sales_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_payment_no_key" ON "customer_payment"("no");

-- CreateIndex
CREATE INDEX "customer_payment_alloc_customer_payment_id_idx" ON "customer_payment_alloc"("customer_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_no_key" ON "sales_return"("no");

-- CreateIndex
CREATE INDEX "sales_return_line_sales_return_id_idx" ON "sales_return_line"("sales_return_id");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_asset_code_key" ON "fixed_asset"("code");

-- CreateIndex
CREATE INDEX "asset_depreciation_fixed_asset_id_idx" ON "asset_depreciation"("fixed_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_disposal_no_key" ON "asset_disposal"("no");

-- CreateIndex
CREATE INDEX "budget_line_budget_id_idx" ON "budget_line"("budget_id");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_feature_switch" ADD CONSTRAINT "role_feature_switch_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_feature_switch" ADD CONSTRAINT "role_feature_switch_feature_switch_id_fkey" FOREIGN KEY ("feature_switch_id") REFERENCES "feature_switch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom" ADD CONSTRAINT "bom_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_reason" ADD CONSTRAINT "stock_reason_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_payable_account_id_fkey" FOREIGN KEY ("payable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request" ADD CONSTRAINT "purchase_request_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_line" ADD CONSTRAINT "purchase_request_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_request_line_id_fkey" FOREIGN KEY ("purchase_request_line_id") REFERENCES "purchase_request_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt" ADD CONSTRAINT "goods_receipt_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_purchase_order_line_id_fkey" FOREIGN KEY ("purchase_order_line_id") REFERENCES "purchase_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_line" ADD CONSTRAINT "purchase_invoice_line_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_line" ADD CONSTRAINT "purchase_invoice_line_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_line" ADD CONSTRAINT "purchase_invoice_line_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_line" ADD CONSTRAINT "purchase_invoice_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_line" ADD CONSTRAINT "purchase_invoice_line_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_direct_purchase_id_fkey" FOREIGN KEY ("direct_purchase_id") REFERENCES "direct_purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_line" ADD CONSTRAINT "purchase_return_line_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_line" ADD CONSTRAINT "purchase_return_line_goods_receipt_line_id_fkey" FOREIGN KEY ("goods_receipt_line_id") REFERENCES "goods_receipt_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_line" ADD CONSTRAINT "purchase_return_line_direct_purchase_line_id_fkey" FOREIGN KEY ("direct_purchase_line_id") REFERENCES "direct_purchase_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_line" ADD CONSTRAINT "purchase_return_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase" ADD CONSTRAINT "direct_purchase_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase" ADD CONSTRAINT "direct_purchase_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase" ADD CONSTRAINT "direct_purchase_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase_line" ADD CONSTRAINT "direct_purchase_line_direct_purchase_id_fkey" FOREIGN KEY ("direct_purchase_id") REFERENCES "direct_purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase_line" ADD CONSTRAINT "direct_purchase_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase_line" ADD CONSTRAINT "direct_purchase_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "direct_purchase_line" ADD CONSTRAINT "direct_purchase_line_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment" ADD CONSTRAINT "purchase_payment_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment" ADD CONSTRAINT "purchase_payment_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_alloc" ADD CONSTRAINT "purchase_payment_alloc_purchase_payment_id_fkey" FOREIGN KEY ("purchase_payment_id") REFERENCES "purchase_payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_alloc" ADD CONSTRAINT "purchase_payment_alloc_purchase_invoice_id_fkey" FOREIGN KEY ("purchase_invoice_id") REFERENCES "purchase_invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_alloc" ADD CONSTRAINT "purchase_payment_alloc_direct_purchase_id_fkey" FOREIGN KEY ("direct_purchase_id") REFERENCES "direct_purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payment_alloc" ADD CONSTRAINT "purchase_payment_alloc_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_return"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance" ADD CONSTRAINT "stock_balance_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment" ADD CONSTRAINT "stock_adjustment_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_stock_adjustment_id_fkey" FOREIGN KEY ("stock_adjustment_id") REFERENCES "stock_adjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_line" ADD CONSTRAINT "stock_adjustment_line_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "stock_reason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname" ADD CONSTRAINT "stock_opname_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname" ADD CONSTRAINT "stock_opname_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_line" ADD CONSTRAINT "stock_opname_line_stock_opname_id_fkey" FOREIGN KEY ("stock_opname_id") REFERENCES "stock_opname"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_line" ADD CONSTRAINT "stock_opname_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_opname_line" ADD CONSTRAINT "stock_opname_line_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "stock_reason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer" ADD CONSTRAINT "stock_transfer_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_line" ADD CONSTRAINT "stock_transfer_line_stock_transfer_id_fkey" FOREIGN KEY ("stock_transfer_id") REFERENCES "stock_transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_line" ADD CONSTRAINT "stock_transfer_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_material_location_id_fkey" FOREIGN KEY ("material_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_output_location_id_fkey" FOREIGN KEY ("output_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_line" ADD CONSTRAINT "production_order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue" ADD CONSTRAINT "material_issue_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue" ADD CONSTRAINT "material_issue_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_line" ADD CONSTRAINT "material_issue_line_material_issue_id_fkey" FOREIGN KEY ("material_issue_id") REFERENCES "material_issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_line" ADD CONSTRAINT "material_issue_line_production_order_line_id_fkey" FOREIGN KEY ("production_order_line_id") REFERENCES "production_order_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_issue_line" ADD CONSTRAINT "material_issue_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_result" ADD CONSTRAINT "production_result_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_result" ADD CONSTRAINT "production_result_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_production" ADD CONSTRAINT "quick_production_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_production" ADD CONSTRAINT "quick_production_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_production" ADD CONSTRAINT "quick_production_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_production_line" ADD CONSTRAINT "quick_production_line_quick_production_id_fkey" FOREIGN KEY ("quick_production_id") REFERENCES "quick_production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_production_line" ADD CONSTRAINT "quick_production_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "member_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift" ADD CONSTRAINT "shift_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_cash_move" ADD CONSTRAINT "shift_cash_move_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale" ADD CONSTRAINT "sale_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment" ADD CONSTRAINT "sale_payment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payment" ADD CONSTRAINT "sale_payment_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settlement" ADD CONSTRAINT "pos_settlement_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settlement" ADD CONSTRAINT "pos_settlement_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settlement_line" ADD CONSTRAINT "pos_settlement_line_pos_settlement_id_fkey" FOREIGN KEY ("pos_settlement_id") REFERENCES "pos_settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_settlement_line" ADD CONSTRAINT "pos_settlement_line_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_mapping" ADD CONSTRAINT "account_mapping_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_period" ADD CONSTRAINT "fiscal_period_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_clearing_account_id_fkey" FOREIGN KEY ("clearing_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_method" ADD CONSTRAINT "payment_method_deposit_account_id_fkey" FOREIGN KEY ("deposit_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_account" ADD CONSTRAINT "bank_account_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fiscal_period"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal" ADD CONSTRAINT "journal_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction_line" ADD CONSTRAINT "cash_transaction_line_cash_transaction_id_fkey" FOREIGN KEY ("cash_transaction_id") REFERENCES "cash_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transaction_line" ADD CONSTRAINT "cash_transaction_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_line" ADD CONSTRAINT "bank_statement_line_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_line" ADD CONSTRAINT "bank_statement_line_bank_reconcile_id_fkey" FOREIGN KEY ("bank_reconcile_id") REFERENCES "bank_reconcile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconcile" ADD CONSTRAINT "bank_reconcile_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconcile_match" ADD CONSTRAINT "bank_reconcile_match_bank_statement_line_id_fkey" FOREIGN KEY ("bank_statement_line_id") REFERENCES "bank_statement_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_reconcile_match" ADD CONSTRAINT "bank_reconcile_match_journal_line_id_fkey" FOREIGN KEY ("journal_line_id") REFERENCES "journal_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_receivable_account_id_fkey" FOREIGN KEY ("receivable_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_line" ADD CONSTRAINT "sales_invoice_line_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_line" ADD CONSTRAINT "sales_invoice_line_sales_order_line_id_fkey" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_line" ADD CONSTRAINT "sales_invoice_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment" ADD CONSTRAINT "customer_payment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment" ADD CONSTRAINT "customer_payment_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_alloc" ADD CONSTRAINT "customer_payment_alloc_customer_payment_id_fkey" FOREIGN KEY ("customer_payment_id") REFERENCES "customer_payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_alloc" ADD CONSTRAINT "customer_payment_alloc_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_return"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_sales_invoice_line_id_fkey" FOREIGN KEY ("sales_invoice_line_id") REFERENCES "sales_invoice_line"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_asset_account_id_fkey" FOREIGN KEY ("asset_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_accum_account_id_fkey" FOREIGN KEY ("accum_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_direct_purchase_line_id_fkey" FOREIGN KEY ("direct_purchase_line_id") REFERENCES "direct_purchase_line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "fiscal_period"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposal" ADD CONSTRAINT "asset_disposal_fixed_asset_id_fkey" FOREIGN KEY ("fixed_asset_id") REFERENCES "fixed_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_disposal" ADD CONSTRAINT "asset_disposal_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Jejak audit hanya bertambah (KONTRAK bagian 5): UPDATE, DELETE, dan TRUNCATE ditolak di tingkat database.
CREATE FUNCTION audit_log_tolak_ubah() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log hanya boleh ditambah, tidak boleh diubah atau dihapus';
END;
$$;

CREATE TRIGGER audit_log_tolak_ubah_baris
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_tolak_ubah();

CREATE TRIGGER audit_log_tolak_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_tolak_ubah();
