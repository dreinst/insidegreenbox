import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const g = globalThis as unknown as { prisma?: PrismaClient }

// Pool kecil karena produksi berbagi 1,5 GB di greenbox.slice (KONTRAK 9).
// Koneksi menganggur ditutup sesudah 30 detik.
export const buatKlien = (url = process.env.DATABASE_URL) =>
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url!,
      max: Number(process.env.DB_POOL_MAX) || 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    }),
  })

export const db = g.prisma ?? buatKlien()

if (process.env.NODE_ENV !== 'production') g.prisma = db

export type Db = PrismaClient
// Klien transaksi interaktif ($transaction(async (tx) => ...)).
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
export type DbAtauTx = Db | Tx
