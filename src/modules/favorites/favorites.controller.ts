import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { AddFavoriteDto } from './dto/add-favorite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('customer', 'studio_owner')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  // ─── Add favorite ─────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add a media file to favorites' })
  @ApiResponse({
    status: 200,
    description: 'Favorite added successfully',
    schema: {
      properties: {
        id: { type: 'string', format: 'uuid' },
        mediaFileId: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — media not in an assigned gallery',
  })
  add(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AddFavoriteDto,
  ) {
    return this.favoritesService.add(user.sub, user.role, dto.mediaFileId);
  }

  // ─── Remove favorite ──────────────────────────────────────────────────────

  @Delete(':mediaFileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a media file from favorites' })
  @ApiParam({
    name: 'mediaFileId',
    description: 'UUID of the media file to remove from favorites',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Favorite removed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — gallery no longer assigned to you',
  })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('mediaFileId', ParseUUIDPipe) mediaFileId: string,
  ) {
    return this.favoritesService.remove(user.sub, user.role, mediaFileId);
  }

  // ─── List favorites ───────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all favorites sorted by time favorited (most recent first)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of favorited media files across all assigned galleries',
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — customers only' })
  async list(@CurrentUser() user: JwtPayload) {
    const favorites = await this.favoritesService.list(user.sub, user.role);
    return { data: favorites };
  }
}
