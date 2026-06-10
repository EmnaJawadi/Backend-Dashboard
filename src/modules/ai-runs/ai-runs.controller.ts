import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AiRunsService } from './ai-runs.service';
import { CreateAiRunDto } from './dto/create-ai-run.dto';
import { AiRunQueryDto } from './dto/ai-run-query.dto';

@Controller(['ai-runs', 'api/ai-runs'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class AiRunsController {
  constructor(private readonly aiRunsService: AiRunsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  create(
    @Body() createAiRunDto: CreateAiRunDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.aiRunsService.create(createAiRunDto, actor);
  }

  @Get()
  findAll(
    @Query() query: AiRunQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.aiRunsService.findAll(query, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiRunsService.findOne(id, actor);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiRunsService.remove(id, actor);
  }
}
