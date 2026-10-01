import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { toPortal, toPortalList } from '../portal/dto/portal.dto';
import { ArtworksService } from './artworks.service';
import {
  AddVersionFileDto, ArtworkListQueryDto, CreateArtworkDto, CreateVersionDto, PortalCommentDto, PortalCommentUpdateDto, PortalDecisionDto,
  ResolveCommentDto, StaffCommentDto, UpdateArtworkDto,
} from './dto/artworks.dto';
import { PortalArtworkCommentView, PortalArtworkListItemView, PortalArtworkView } from './dto/portal-artworks.dto';

// Multer caps the request; StorageService enforces MAX_UPLOAD_MB precisely.
const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('artworks')
@Controller()
export class ArtworksController {
  constructor(private readonly artworks: ArtworksService) {}

  @RequirePermission('artwork.view') @Get('artworks')
  list(@Query() q: ArtworkListQueryDto) { return this.artworks.list(q); }

  @RequirePermission('artwork.view') @Get('artworks/:id')
  get(@Param('id', uuid) id: string) { return this.artworks.get(id); }

  @RequirePermission('artwork.create') @Post('artworks')
  @ApiConsumes('multipart/form-data') @UseInterceptors(upload)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateArtworkDto, @UploadedFile() file?: Express.Multer.File) {
    return this.artworks.create(user, dto, file);
  }

  @RequirePermission('artwork.create') @Patch('artworks/:id')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateArtworkDto) { return this.artworks.update(id, dto); }

  @RequirePermission('artwork.upload_version') @Post('artworks/:id/versions')
  @ApiConsumes('multipart/form-data') @UseInterceptors(upload)
  createVersion(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: CreateVersionDto, @UploadedFile() file?: Express.Multer.File) {
    return this.artworks.createVersion(user, id, dto, file);
  }

  @RequirePermission('artwork.upload_version') @Post('artwork-versions/:id/files')
  @ApiConsumes('multipart/form-data') @UseInterceptors(upload)
  addFile(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: AddVersionFileDto, @UploadedFile() file?: Express.Multer.File) {
    return this.artworks.addFile(user, id, dto, file);
  }

  @RequirePermission('artwork.send_proof') @Post('artwork-versions/:id/send') @HttpCode(200)
  send(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) { return this.artworks.send(user, id); }

  @RequirePermission('artwork.view') @Get('artwork-versions/:id/comments')
  comments(@Param('id', uuid) id: string) { return this.artworks.staffComments(id); }

  /** SHARED needs artwork.comment, INTERNAL needs artwork.comment.internal (checked in the service). */
  @RequirePermission('artwork.comment', 'artwork.comment.internal') @Post('artwork-versions/:id/comments')
  addComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: StaffCommentDto) {
    return this.artworks.addStaffComment(user, id, dto);
  }

  @RequirePermission('artwork.comment.resolve') @Patch('artwork-comments/:id')
  setCommentStatus(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: ResolveCommentDto) {
    return this.artworks.setCommentStatus(user, id, dto);
  }
}

/** Customer-facing artwork review. Tenant always comes from the JWT. */
@ApiTags('portal')
@Controller('portal')
export class PortalArtworksController {
  constructor(private readonly artworks: ArtworksService) {}

  @RequirePermission('portal.artwork.view') @Get('artworks')
  async list(@CurrentUser() user: AuthUser) {
    return toPortalList(PortalArtworkListItemView, await this.artworks.portalList(user));
  }

  @RequirePermission('portal.artwork.view') @Get('artworks/:id')
  async get(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return toPortal(PortalArtworkView, await this.artworks.portalGet(user, id));
  }

  @RequirePermission('portal.artwork.view') @Post('artwork-versions/:id/viewed') @HttpCode(200)
  viewed(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) { return this.artworks.portalMarkViewed(user, id); }

  @RequirePermission('portal.artwork.view') @Get('artwork-versions/:id/comments')
  async comments(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return toPortalList(PortalArtworkCommentView, await this.artworks.portalComments(user, id));
  }

  @RequirePermission('portal.artwork.comment') @Post('artwork-versions/:id/comments')
  async addComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: PortalCommentDto) {
    return toPortal(PortalArtworkCommentView, await this.artworks.portalAddComment(user, id, dto));
  }

  @RequirePermission('portal.artwork.comment') @Patch('artwork-comments/:id')
  async updateComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: PortalCommentUpdateDto) {
    return toPortal(PortalArtworkCommentView, await this.artworks.portalUpdateComment(user, id, dto));
  }

  @RequirePermission('portal.artwork.comment') @Delete('artwork-comments/:id') @HttpCode(204)
  async deleteComment(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    await this.artworks.portalDeleteComment(user, id);
  }

  /** Request changes (any reviewer) or approve (contact with approval authority — checked in the service). */
  @RequirePermission('portal.artwork.comment', 'portal.artwork.decide') @Post('artwork-versions/:id/decision') @HttpCode(200)
  async decide(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: PortalDecisionDto, @Req() req: any) {
    const ip = (req.ip as string) || null;
    const userAgent = (req.headers?.['user-agent'] as string) ?? null;
    return toPortal(PortalArtworkView, await this.artworks.portalDecide(user, id, dto, { ip, userAgent }));
  }
}
