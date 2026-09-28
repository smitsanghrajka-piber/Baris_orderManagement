import { Module } from '@nestjs/common';
import { ToolingController } from './tooling.controller';
import { ToolingService } from './tooling.service';

@Module({
  controllers: [ToolingController],
  providers: [ToolingService],
  exports: [ToolingService],
})
export class ToolingModule {}
