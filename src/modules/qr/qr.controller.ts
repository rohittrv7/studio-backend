import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Response } from 'express';
import { QrService } from './qr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('qr')
@Controller('qr')
export class QrController {
  constructor(private readonly qrService: QrService) {}

  // ─── Generate QR ─────────────────────────────────────────────────────────

  @Post('generate/:galleryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('studio_owner')
  @ApiBearerAuth()
  @ApiProduces('image/png')
  @ApiOperation({ summary: 'Generate a QR code for a gallery' })
  @ApiResponse({ status: 200, description: 'QR code generated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  generate(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Query('folderId') folderId?: string,
    @Query('mediaFileId') mediaFileId?: string,
  ) {
    return this.qrService.generate(galleryId, user.sub, folderId, mediaFileId);
  }

  // ─── Revoke QR ───────────────────────────────────────────────────────────

  @Post('revoke/:galleryId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('studio_owner')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the active QR link for a gallery' })
  @ApiResponse({ status: 200, description: 'QR link revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery or active QR link not found' })
  revoke(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
  ) {
    return this.qrService.revoke(galleryId, user.sub);
  }

  // ─── Validate QR ─────────────────────────────────────────────────────────

  @Get('validate/:token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Validate a QR token (public, rate-limited)' })
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 403, description: 'Token is invalid or gallery/customer is locked' })
  @ApiResponse({ status: 410, description: 'QR link has been revoked' })
  validate(@Param('token') token: string) {
    return this.qrService.validate(token);
  }

  // ─── Redirect ─────────────────────────────────────────────────────────────

  @Get('redirect/:token')
  @ApiProduces('text/html')
  @ApiOperation({ summary: 'Redirect to App Store or Play Store based on device (public)' })
  @ApiResponse({ status: 302, description: 'Redirect to appropriate app store' })
  @ApiResponse({ status: 200, description: 'HTML page with app store links (unknown platform)' })
  async redirect(
    @Param('token') token: string,
    @Headers('user-agent') userAgent: string,
    @Res() res: Response,
  ) {
    const { platform, iosUrl, androidUrl } = this.qrService.redirect(token, userAgent || '');

    if (platform === 'ios') {
      return res.redirect(302, iosUrl);
    }

    if (platform === 'android') {
      return res.redirect(302, androidUrl);
    }

    // Unknown platform — serve HTML page with both links
    const html = `<!DOCTYPE html>
<html>
  <head><title>Open Studio Gallery</title></head>
  <body>
    <h1>Open Studio Gallery App</h1>
    <p><a href="${iosUrl}">Download on the App Store</a></p>
    <p><a href="${androidUrl}">Get it on Google Play</a></p>
  </body>
</html>`;

    return res.status(200).type('text/html').send(html);
  }
}
