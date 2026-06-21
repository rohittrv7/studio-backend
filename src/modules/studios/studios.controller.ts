import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StudiosService } from './studios.service';

@ApiTags('studios')
@Controller('studios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StudiosController {
  constructor(private readonly studiosService: StudiosService) {}

  @Get()
  @ApiOperation({ summary: 'List all studio owners (public/auth, filtered by location and date)' })
  findAll(
    @Query('location') location?: string,
    @Query('bookingDate') bookingDate?: string,
  ) {
    return this.studiosService.findAll(location, bookingDate);
  }


  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific studio, its plans, and demo media' })
  findOne(@Param('id') id: string) {
    return this.studiosService.findOne(id);
  }
}
