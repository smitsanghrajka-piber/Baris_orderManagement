import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerUsersService } from './customer-users.service';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerUsersService],
  exports: [CustomersService, CustomerUsersService],
})
export class CustomersModule {}
