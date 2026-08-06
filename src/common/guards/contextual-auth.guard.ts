// src/common/guards/contextual-auth.guard.ts
// GATE 2: Contextual Authorization Guard.
// Memverifikasi apakah auditor terdaftar dalam tim Surat Tugas (PT/KT/AT)
// untuk transaksi yang diakses (Surat Tugas / KKA / Temuan).
// Mematuhi keputusan arsitektur ADR-001.

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContextualAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Dihasilkan oleh JWT Auth Guard (Gate 1)

    // Jika Gate 1 belum diimplementasikan/dilewati (untuk keperluan development/mocking),
    // kita sediakan fallback mock user dari header 'x-mock-user-id' dan 'x-mock-role'
    const mockUserId = request.headers['x-mock-user-id'];
    const mockRole = request.headers['x-mock-role'];
    const mockPegawaiId = request.headers['x-mock-pegawai-id'];

    const activeUser = user || {
      id: mockUserId || 'mock-user-uuid',
      role: mockRole || 'APIP_INTERNAL',
      pegawaiId: mockPegawaiId || null,
    };

    // Pimpinan (Irban & Inspektur) memiliki hak akses penuh untuk QC/Approval lintas tim
    if (activeUser.role === 'APIP_PIMPINAN') {
      return true;
    }

    if (activeUser.role !== 'APIP_INTERNAL' || !activeUser.pegawaiId) {
      throw new ForbiddenException(
        'Akses ditolak: Peran Anda tidak memiliki wewenang untuk aksi ini.',
      );
    }

    const { params, body, query } = request;

    // Cari ST ID dari berbagai kemungkinan sumber input
    let stId = params.stId || body.stId || query.stId;

    // Jika tidak ada stId langsung, cari berdasarkan KKA ID
    const kkaId = params.kkaId || params.id || body.kkaId;
    if (!stId && kkaId) {
      // Cek apakah parameter id/kkaId adalah UUID valid sebelum query database
      if (this.isValidUuid(kkaId)) {
        const kka = await this.prisma.trKka.findUnique({
          where: { id: kkaId },
          select: { stId: true },
        });
        if (kka) {
          stId = kka.stId;
        }
      }
    }

    // Jika stId masih belum ditemukan, tetapi path adalah ST detail
    if (!stId && params.id && this.isValidUuid(params.id)) {
      // Periksa apakah ID tersebut adalah Surat Tugas
      const st = await this.prisma.trSuratTugas.findUnique({
        where: { id: params.id },
        select: { id: true },
      });
      if (st) {
        stId = st.id;
      }
    }

    // Jika tidak ada konteks Surat Tugas sama sekali, tolak secara aman
    if (!stId) {
      throw new BadRequestException(
        'Konteks Surat Tugas (stId/kkaId) tidak ditemukan pada request.',
      );
    }

    if (!this.isValidUuid(stId)) {
      throw new BadRequestException('Format ID Surat Tugas tidak valid.');
    }

    // Lakukan pemeriksaan keanggotaan tim di database (rel_st_auditor)
    const membership = await this.prisma.relStAuditor.findFirst({
      where: {
        stId: stId,
        auditorId: activeUser.pegawaiId,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak terdaftar sebagai tim pemeriksa pada Surat Tugas ini.',
      );
    }

    // Simpan informasi peran anggota tim ke request agar bisa dibaca di controller
    request.userTeamRole = membership.peranDalamTim;

    return true;
  }

  private isValidUuid(id: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}
