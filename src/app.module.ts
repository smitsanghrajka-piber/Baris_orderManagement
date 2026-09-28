import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { AuthCommonModule } from './common/auth/auth-common.module';
import { NumberingModule } from './common/numbering/numbering.module';
import { StorageModule } from './common/storage/storage.module';
import { TenantModule } from './common/tenant/tenant.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { AuditContextInterceptor } from './common/audit/audit-context.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { ToolingModule } from './modules/tooling/tooling.module';
import { FilesModule } from './modules/files/files.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditQueryModule } from './modules/audit/audit-query.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PortalModule } from './modules/portal/portal.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: false, global: true }),
    ScheduleModule.forRoot(),
    // Global rate limit: 100 req / 60 s per IP; login routes tighten with @Throttle().
    // THROTTLE_DISABLED=1 (set by the integration test harness, which fires
    // hundreds of requests from one address) bypasses every throttler.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      skipIf: () => process.env.THROTTLE_DISABLED === '1',
    }),

    // cross-cutting (all @Global)
    PrismaModule, AuditModule, AuthCommonModule, NumberingModule, StorageModule, TenantModule, IdempotencyModule,

    // domain
    NotificationsModule, AuthModule, UsersModule, CustomersModule, ProductsModule, MasterDataModule, ToolingModule,
    FilesModule, AuditQueryModule, SettingsModule, PortalModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: throttle → authenticate → authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor },
  ],
})
export class AppModule {}
