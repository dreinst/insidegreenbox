-- AlterTable
ALTER TABLE "member" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "member_tier" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kcal" INTEGER,
ADD COLUMN     "sort" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "menu_category" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_price_batch" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "rule" TEXT NOT NULL DEFAULT '',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_price_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_price_history" (
    "id" SERIAL NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "old_price" BIGINT NOT NULL,
    "new_price" BIGINT NOT NULL,

    CONSTRAINT "menu_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_set" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "main_item_id" INTEGER NOT NULL,
    "drink_item_id" INTEGER NOT NULL,
    "normal_price" BIGINT NOT NULL,
    "price" BIGINT NOT NULL,
    "image" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "percent" DECIMAL(6,3),
    "amount" BIGINT,
    "gift_item_id" INTEGER,
    "condition" TEXT NOT NULL DEFAULT '',
    "min_spend" BIGINT NOT NULL DEFAULT 0,
    "starts_on" DATE,
    "ends_on" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_category_code_key" ON "menu_category"("code");

-- CreateIndex
CREATE INDEX "menu_price_history_batch_id_idx" ON "menu_price_history"("batch_id");

-- CreateIndex
CREATE INDEX "menu_price_history_menu_item_id_idx" ON "menu_price_history"("menu_item_id");

-- Menu lama yang kategorinya masih teks bebas: buat baris kategori untuk tiap nilai yang ada,
-- supaya kunci asing di bawah tidak gagal. Nama awalnya sama dengan kodenya dan bisa diubah dari layar Kategori.
INSERT INTO "menu_category" ("code", "name", "sort", "updated_at")
SELECT DISTINCT "category", "category", 0, CURRENT_TIMESTAMP FROM "menu_item"
ON CONFLICT ("code") DO NOTHING;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_category_fkey" FOREIGN KEY ("category") REFERENCES "menu_category"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_price_history" ADD CONSTRAINT "menu_price_history_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "menu_price_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_price_history" ADD CONSTRAINT "menu_price_history_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_set" ADD CONSTRAINT "menu_set_main_item_id_fkey" FOREIGN KEY ("main_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_set" ADD CONSTRAINT "menu_set_drink_item_id_fkey" FOREIGN KEY ("drink_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo" ADD CONSTRAINT "promo_gift_item_id_fkey" FOREIGN KEY ("gift_item_id") REFERENCES "menu_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
