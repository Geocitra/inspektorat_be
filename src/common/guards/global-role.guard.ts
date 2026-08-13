// src/common/guards/global-role.guard.ts
import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class GlobalRoleGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();

        // Mendukung JWT User object asli maupun header Mock-User dari arsitektur saat ini
        const user = request.user;
        const mockRole = request.headers['x-mock-role'];

        const activeRole = user?.role || mockRole || 'GUEST';

        // Otorisasi: Hanya pegawai internal Inspektorat dan Pimpinan yang diizinkan
        if (activeRole === 'APIP_INTERNAL' || activeRole === 'APIP_PIMPINAN') {
            return true;
        }

        throw new ForbiddenException(
            'Akses ditolak: Hanya Pegawai Internal Inspektorat atau Pimpinan yang memiliki wewenang untuk mengakses sumber daya ini.',
        );
    }
}