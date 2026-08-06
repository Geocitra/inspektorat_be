# ADR-001: Desain RBAC — 4 Database Roles + Contextual Authorization

> **Architecture Decision Record (ADR)**
> **Status:** FINAL — Disetujui
> **Berlaku untuk:** Seluruh modul otorisasi di APIP Suite Backend (NestJS)

---

## Latar Belakang & Masalah

Secara fungsional, terdapat **10 aktor bisnis** dalam sistem pengawasan Inspektorat (lihat `RBAC.txt`). Pertanyaan arsitekturalnya adalah: *Apakah kita harus membuat 10 peran (Role) terpisah di database?*

**Jawaban: TIDAK.**

Membuat 10 database roles yang kaku akan menimbulkan cacat logika arsitektur (*logical fallacy*) karena:

> **⚠️ MASALAH NYATA DI LAPANGAN:** Satu orang pegawai Inspektorat (misalnya "Budi") bisa memiliki peran yang BERBEDA tergantung penugasan yang sedang berjalan:
> - **Senin:** Budi = Ketua Tim audit Dinas Pendidikan
> - **Rabu:** Budi = Anggota Tim audit Dinas Kesehatan
> - **Jumat:** Budi = Auditor Verifikator untuk TLHP Dinas PU
>
> Jika ada role kaku `ROLE_KETUA_TIM`, akun Budi harus terus diubah setiap penugasan baru — ini adalah *anti-pattern* yang tidak bisa dipelihara.

---

## Keputusan Arsitektur

Kita memisahkan konsep **"Aktor Bisnis"** (siapa yang berinteraksi di Use Case) dengan **"Peran Sistem"** (bagaimana akun dideklarasikan di database). Mengacu pada metodologi OOAD Craig Larman.

### Solusi: 4 Database Roles + Contextual Authorization

#### Bagian 1: 4 Database Roles (Disimpan di Tabel `users.role`)

```
┌──────────────────────────────────────────────────────────────────────┐
│                         4 DATABASE ROLES                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. APIP_INTERNAL    → Semua pegawai Inspektorat tanpa terkecuali   │
│                         (Perencana, Kasubag, Auditor Pelaksana,      │
│                          Verifikator, Tim Penelaah WBS)              │
│                                                                      │
│  2. APIP_PIMPINAN    → Pejabat struktural pemegang hak otorisasi    │
│                         dan tanda tangan elektronik (TTE)            │
│                         (Irban & Inspektur)                          │
│                                                                      │
│  3. AUDITEE_OPD      → Pihak luar (Admin OPD) yang hanya bisa      │
│                         melihat data milik OPD-nya sendiri dan       │
│                         mengunggah bukti TLHP                        │
│                                                                      │
│  4. KEPALA_DAERAH    → Akun Bupati/Walikota. Read-only dashboard    │
│                         kepatuhan real-time seluruh OPD              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

> **🔴 ATURAN MUTLAK:** Pelapor WBS (Whistleblower) **TIDAK MEMILIKI AKUN** di tabel `users`. Mereka adalah **Guest/Anonim** yang diautentikasi hanya menggunakan **Token Pelacakan** (`wbs_aduan.token_pelacakan`) pada setiap request. Memasukkan pelapor ke tabel `users` adalah **kesalahan keamanan yang fatal** karena berpotensi membocorkan identitas.

---

#### Bagian 2: Contextual Authorization (Otorisasi Berbasis Konteks)

Database Role hanya digunakan sebagai **gerbang masuk pertama** (Gate 1). Untuk izin yang lebih granular di dalam modul, sistem menggunakan pemeriksaan konteks terhadap data transaksi yang sedang berjalan.

**Contoh Kasus: Siapa yang boleh mengedit sebuah KKA?**

Sistem TIDAK memeriksa: *"Apakah role == 'Ketua_Tim'?"*

Sistem memeriksa tabel `rel_st_auditor` (Contextual Check):

```typescript
// Pseudocode NestJS Guard - Logika Contextual Authorization
async function canEditKKA(pegawaiId: string, kkaId: string): Promise<boolean> {
  // 1. Ambil data KKA untuk mengetahui ST-nya
  const kka = await prisma.trKka.findUnique({ where: { id: kkaId } });

  // 2. Cek apakah pegawai ini TERDAFTAR dalam Surat Tugas tersebut
  const keanggotaanTim = await prisma.relStAuditor.findFirst({
    where: {
      stId: kka.stId,
      auditorId: pegawaiId,
      // Hanya Ketua Tim atau Anggota Tim yang boleh edit KKA
      peranDalamTim: { in: ['Ketua_Tim', 'Anggota_Tim'] }
    }
  });

  // 3. Jika terdaftar di ST ini → IZINKAN. Jika tidak → TOLAK.
  return keanggotaanTim !== null;
}
```

---

## Pemetaan Lengkap: 10 Aktor Bisnis → 4 Database Roles

| Aktor Bisnis (Use Case) | Database Role | Granularitas Akses Tambahan |
|---|---|---|
| Auditor Perencana | `APIP_INTERNAL` | Dikontrol oleh Guard modul PKPT |
| Kasubag Administrasi | `APIP_INTERNAL` | Dikontrol oleh Guard modul ST |
| Auditor Pelaksana (Anggota Tim) | `APIP_INTERNAL` | **Contextual:** Cek `rel_st_auditor` |
| Ketua Tim | `APIP_INTERNAL` | **Contextual:** Cek `rel_st_auditor.peran = Ketua_Tim` |
| Auditor Verifikator | `APIP_INTERNAL` | **Contextual:** Cek assignment verifikasi aktif |
| Tim Penelaah WBS | `APIP_INTERNAL` | Dikontrol oleh Guard khusus modul WBS |
| Inspektur Pembantu (Irban) | `APIP_PIMPINAN` | Dikontrol oleh Guard modul locking & otorisasi |
| Inspektur | `APIP_PIMPINAN` | Dikontrol oleh Guard TTE & approval |
| Admin OPD (Auditee) | `AUDITEE_OPD` | **Scoped:** Hanya bisa akses data OPD-nya sendiri |
| Kepala Daerah (Bupati) | `KEPALA_DAERAH` | Read-only seluruh dashboard |
| Pelapor WBS | ❌ **Tidak ada akun** | Autentikasi via Token pelacakan saja |

---

## Aturan Implementasi untuk Developer & AI Agent

### Rule 1: Struktur Tabel `users` di Prisma

```prisma
// prisma/schema.prisma
enum SystemRole {
  APIP_INTERNAL
  APIP_PIMPINAN
  AUDITEE_OPD
  KEPALA_DAERAH
}

model User {
  id        String     @id @default(uuid()) @db.Uuid
  email     String     @unique @db.VarChar(255)
  password  String     @db.VarChar(255) // Bcrypt hash
  role      SystemRole
  pegawaiId String?    @unique @db.Uuid // FK ke mst_auditor (null jika OPD/Bupati)
  opdId     String?    @db.Uuid         // FK ke mst_opd (hanya untuk AUDITEE_OPD)
  isActive  Boolean    @default(true)
  createdAt DateTime   @default(now()) @db.Timestamptz

  @@map("users")
}
```

### Rule 2: Urutan Pemeriksaan Akses (2-Gate System)

```
Request Masuk
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│  GATE 1: JWT Auth Guard                                 │
│  → Apakah token valid & belum expired?                  │
│  → Apakah role punya akses ke endpoint?                 │
│    (misal: @Roles(SystemRole.APIP_INTERNAL))            │
└────────────────────────┬────────────────────────────────┘
                         │ LOLOS
                         ▼
┌─────────────────────────────────────────────────────────┐
│  GATE 2: Contextual Guard (jika ada)                    │
│  → Apakah pegawai terdaftar di Surat Tugas ini?         │
│  → Apakah data ini milik OPD-nya sendiri?               │
│  → Apakah peran di ST memadai (KT/AT)?                  │
└────────────────────────┬────────────────────────────────┘
                         │ LOLOS
                         ▼
                 ✅ Akses Diberikan
```

### Rule 3: Aturan Scoping Data `AUDITEE_OPD` (Anti-IDOR)

Setiap query data yang dilakukan oleh role `AUDITEE_OPD` **wajib** disaring menggunakan `opd_id` dari JWT token pengguna, bukan dari parameter request:

```typescript
// ✅ BENAR — OPD ID diambil dari JWT, bukan dari input user
async getMyRecommendations(user: JwtPayload) {
  return prisma.trRekomendasi.findMany({
    where: { temuan: { opd_id: user.opdId } } // Disaring paksa dari token
  });
}

// ❌ SALAH — Membiarkan user memilih OPD ID sendiri
// (Insecure Direct Object Reference / IDOR Vulnerability)
async getRecommendationsByOpdId(opdId: string) {
  return prisma.trRekomendasi.findMany({
    where: { temuan: { opd_id: opdId } } // ← BERBAHAYA!
  });
}
```

---

## Ringkasan Keuntungan Arsitektur

| Kriteria | 10 Role Kaku ❌ | 4 Role + Contextual ✅ |
|---|---|---|
| **Fleksibilitas Penugasan** | Harus ubah role tiap penugasan | Peran ditentukan oleh `rel_st_auditor` |
| **Ukuran JWT Token** | Besar & lambat | Kecil & cepat |
| **Kompleksitas Database** | Sangat rumit | Bersih & ringan |
| **Keamanan WBS** | Pelapor berpotensi punya akun | Pelapor murni anonim via Token |
| **Low Coupling** | Logika terikat nama role | Logika terikat data transaksi fisik |

---

## ⛔ Larangan Keras untuk AI Coding Agent

1. **JANGAN** membuat lebih dari 4 nilai pada enum `SystemRole`. Jika Anda menambahkan `ROLE_KETUA_TIM`, `ROLE_VERIFIKATOR`, atau sejenisnya — **Anda melanggar ADR ini**.

2. **JANGAN** membuat tabel `roles` terpisah atau sistem pivot `user_roles`. Gunakan kolom `role` enum langsung di tabel `users`.

3. **JANGAN** pernah menggunakan `opdId` dari request body untuk filter data `AUDITEE_OPD`. Selalu gunakan `user.opdId` dari JWT payload.

4. **JANGAN** membuat akun/user untuk Pelapor WBS. Gunakan token pelacakan di tabel `wbs_aduan`.
