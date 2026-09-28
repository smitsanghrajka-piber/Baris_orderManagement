import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Public, RequirePermission } from '../../common/auth/decorators';
import { CompanySettingsDto, NumberSequenceDto } from './dto/settings.dto';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Branding for login pages — no secrets, no internal defaults. */
  @Public() @Get('public')
  publicCompany() { return this.settings.publicCompany(); }

  @RequirePermission('settings.edit') @Get('company')
  company() { return this.settings.company(); }

  @RequirePermission('settings.edit') @Patch('company')
  updateCompany(@Body() dto: CompanySettingsDto) { return this.settings.updateCompany(dto); }

  @RequirePermission('settings.edit') @Get('numbering')
  sequences() { return this.settings.sequences(); }

  @RequirePermission('settings.edit') @Patch('numbering/:key')
  updateSequence(@Param('key') key: string, @Body() dto: NumberSequenceDto) { return this.settings.updateSequence(key, dto); }
}
