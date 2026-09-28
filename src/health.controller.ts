import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth/decorators';
import { PrismaService } from './common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let db = 'ok';
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { db = 'unavailable'; }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString(), version: process.env.npm_package_version ?? null };
  }
}
