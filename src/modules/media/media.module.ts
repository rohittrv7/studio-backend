import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CloudinaryModule } from './cloudinary.module';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  providers: [MediaService],
  controllers: [MediaController],
  exports: [MediaService, CloudinaryModule],
})
export class MediaModule {}
