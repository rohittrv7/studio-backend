import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { PlansService } from './plans.service';
import { CreatePlanDto } from './plans.dto';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Create a booking plan (Studio Owners only)' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePlanDto) {
    return this.plansService.create(user.sub, dto);
  }

  @Get('my-plans')
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Get all plans for the logged-in studio owner' })
  getMyPlans(@CurrentUser() user: JwtPayload) {
    return this.plansService.getMyPlans(user.sub);
  }

  @Delete(':id')
  @Roles('studio_owner')
  @ApiOperation({ summary: 'Delete a plan (Studio Owners only)' })
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.plansService.delete(user.sub, id);
  }
}
