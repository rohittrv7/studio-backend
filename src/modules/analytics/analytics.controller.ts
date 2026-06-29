import {
  Body,
  Controller,
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
import { AnalyticsService } from './analytics.service';
import { RecordViewDto } from './dto/record-view.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ─── Record view (customer) ───────────────────────────────────────────────

  /**
   * Req 15.3, 15.5 — fire-and-forget view recording.
   * Returns 202 immediately; the upsert runs asynchronously via setImmediate.
   */
  @Post('view')
  @Roles('customer')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Record a gallery view for the authenticated customer' })
  @ApiResponse({
    status: 202,
    description: 'View accepted for async processing',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — customers only' })
  recordView(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordViewDto,
  ): Record<string, never> {
    this.analyticsService.recordView(user.sub, dto.galleryId);
    return {};
  }

  @Get('overview')
  @Roles('studio_owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get overall aggregated analytics overview for studio owner' })
  getOverviewAnalytics(@CurrentUser() user: JwtPayload) {
    return this.analyticsService.getOverviewAnalytics(user.sub);
  }

  // ─── Get gallery analytics (studio_owner) ────────────────────────────────

  /**
   * Req 15.4 — return aggregated analytics for a gallery owned by the requester.
   */
  @Get('galleries/:galleryId')
  @Roles('studio_owner')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get analytics for a specific gallery' })
  @ApiParam({
    name: 'galleryId',
    description: 'UUID of the gallery to fetch analytics for',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Gallery analytics',
    schema: {
      properties: {
        galleryId: { type: 'string', format: 'uuid' },
        firstViewedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
        },
        lastViewedAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
        },
        totalViewCount: { type: 'integer', minimum: 0 },
        totalDownloadCount: { type: 'integer', minimum: 0 },
        viewedStatus: {
          type: 'string',
          enum: ['viewed', 'not_yet_viewed'],
        },
        mediaDownloads: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mediaFileId: { type: 'string', format: 'uuid' },
              downloadCount: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — not your gallery' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  getGalleryAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId', ParseUUIDPipe) galleryId: string,
  ) {
    return this.analyticsService.getGalleryAnalytics(galleryId, user.sub);
  }
}
