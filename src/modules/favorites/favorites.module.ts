import { Module } from '@nestjs/common';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from '../media/cloudinary.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, CloudinaryModule, ConfigModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
