import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GalleriesService } from './galleries.service';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { AssignGalleryDto } from './dto/assign-gallery.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('galleries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('galleries')
export class GalleriesController {
  constructor(private readonly galleriesService: GalleriesService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Create a new gallery' })
  @ApiBody({ type: CreateGalleryDto })
  @ApiResponse({ status: 201, description: 'Gallery created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGalleryDto,
  ) {
    return this.galleriesService.create(user.sub, dto);
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner', 'customer')
  @ApiOperation({ summary: 'List all galleries with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Paginated list of galleries' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.galleriesService.findAll(
      user.sub,
      user.role,
      Math.max(1, parseInt(page, 10) || 1),
      Math.min(100, Math.max(1, parseInt(limit, 10) || 20)),
    );
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner', 'customer')
  @ApiOperation({ summary: 'Get a single gallery by id (studio owner or assigned customer)' })
  @ApiParam({ name: 'id', description: 'UUID of the gallery', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Gallery details' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.galleriesService.findOne(id, user);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Update a gallery (name, customerId, or downloadEnabled)' })
  @ApiParam({ name: 'id', description: 'UUID of the gallery to update', format: 'uuid' })
  @ApiBody({ type: UpdateGalleryDto })
  @ApiResponse({ status: 200, description: 'Gallery updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGalleryDto,
  ) {
    return this.galleriesService.update(id, user.sub, dto);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({
    summary: 'Soft-delete a gallery, all nested folders, media files, and QR links',
  })
  @ApiParam({ name: 'id', description: 'UUID of the gallery to delete', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Gallery deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.galleriesService.remove(id, user.sub);
  }

  // ─── Assign ───────────────────────────────────────────────────────────────

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Assign a gallery to a customer (triggers FCM push notification)' })
  @ApiParam({ name: 'id', description: 'UUID of the gallery to assign', format: 'uuid' })
  @ApiBody({ type: AssignGalleryDto })
  @ApiResponse({ status: 200, description: 'Gallery assigned successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery not found' })
  assign(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignGalleryDto,
  ) {
    return this.galleriesService.assign(id, user.sub, dto);
  }
}
