import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { CustomersModule } from '../customers/customers.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [CustomersModule, FilesModule],
  controllers: [PortalController],
})
export class PortalModule {}
