import { Module } from '@nestjs/common';
import { ArtworksController, PortalArtworksController } from './artworks.controller';
import { ArtworksService } from './artworks.service';

@Module({
  controllers: [ArtworksController, PortalArtworksController],
  providers: [ArtworksService],
  exports: [ArtworksService],
})
export class ArtworksModule {}
