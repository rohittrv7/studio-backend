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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@ApiTags('folders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('galleries/:galleryId/folders')
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Create a new folder in a gallery' })
  @ApiParam({ name: 'galleryId', description: 'UUID of the parent gallery', format: 'uuid' })
  @ApiBody({ type: CreateFolderDto })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery or parent folder not found' })
  @ApiResponse({ status: 422, description: 'Maximum folder nesting depth exceeded' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.foldersService.create(galleryId, dto, user.sub);
  }

  // ─── Get Tree ─────────────────────────────────────────────────────────────

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner', 'customer')
  @ApiOperation({ summary: 'Get the full hierarchical folder tree for a gallery' })
  @ApiParam({ name: 'galleryId', description: 'UUID of the gallery', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Folder tree returned successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  getTree(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
  ) {
    return this.foldersService.getTree(galleryId, user.sub, user.role);
  }

  // ─── Rename ───────────────────────────────────────────────────────────────

  @Patch(':folderId')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Rename a folder' })
  @ApiParam({ name: 'galleryId', description: 'UUID of the parent gallery', format: 'uuid' })
  @ApiParam({ name: 'folderId', description: 'UUID of the folder to rename', format: 'uuid' })
  @ApiBody({ type: RenameFolderDto })
  @ApiResponse({ status: 200, description: 'Folder renamed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery or folder not found' })
  rename(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Param('folderId') folderId: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.foldersService.rename(galleryId, folderId, dto, user.sub);
  }

  // ─── Remove ───────────────────────────────────────────────────────────────

  @Delete(':folderId')
  @HttpCode(HttpStatus.OK)
  @Roles('studio_owner')
  @ApiOperation({
    summary: 'Soft-delete a folder, all descendants, and their media files',
  })
  @ApiParam({ name: 'galleryId', description: 'UUID of the parent gallery', format: 'uuid' })
  @ApiParam({ name: 'folderId', description: 'UUID of the folder to delete', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorised' })
  @ApiResponse({ status: 403, description: 'Forbidden — studio owners only' })
  @ApiResponse({ status: 404, description: 'Gallery or folder not found' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('galleryId') galleryId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.foldersService.remove(galleryId, folderId, user.sub);
  }
}
