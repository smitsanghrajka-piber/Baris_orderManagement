import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { FilesService } from './files.service';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { AttachmentsQueryDto, UploadAttachmentDto } from './dto/files.dto';
import { StorageService } from '../../common/storage/storage.service';
import { LocalStorageDriver } from '../../common/storage/drivers/local.driver';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';

@ApiTags('files')
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService, private readonly storage: StorageService) {}

  @RequirePermission('attachment.create')
  @Post('files')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }))
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadAttachmentDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new ValidationError('No file was uploaded (field name "file").');
    return this.files.uploadAttachment(user, dto, file);
  }

  @RequirePermission('file.view')
  @Get('attachments')
  list(@CurrentUser() user: AuthUser, @Query() q: AttachmentsQueryDto) {
    return this.files.listAttachments(user, q.entityType, q.entityId);
  }

  @RequirePermission('file.view')
  @Get('files/:id/url')
  url(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('download') download?: string) {
    return this.files.signedUrl(user, id, download === '1' || download === 'true');
  }

  /**
   * Local-driver "signed URL" target. Public by design: the HMAC in the query
   * is the credential, exactly like a Supabase signed URL. Never mounted when
   * the Supabase driver is active.
   */
  @Public()
  @Get('files/local')
  async local(@Query('bucket') bucket: string, @Query('key') key: string, @Query('exp') exp: string, @Query('d') d: string, @Query('sig') sig: string, @Res() res: any) {
    const driver = this.storage.driver;
    if (!(driver instanceof LocalStorageDriver)) throw new NotFoundError('File');
    if (!bucket || !key || !exp || !d || !sig || !driver.verify(bucket, key, Number(exp), d, sig)) throw new NotFoundError('File');
    if (!(await driver.exists(bucket, key))) throw new NotFoundError('File');
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', d);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    driver.getStream(bucket, key).pipe(res);
  }
}
