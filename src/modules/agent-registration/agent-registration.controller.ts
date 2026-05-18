import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AgentRegistrationService } from './agent-registration.service';
import { CreateAgentRegistrationRequestDto } from './dto/create-agent-registration-request.dto';
import { QueryAgentRegistrationRequestsDto } from './dto/query-agent-registration-requests.dto';
import { RejectAgentRegistrationRequestDto } from './dto/reject-agent-registration-request.dto';

@Controller()
export class AgentRegistrationController {
  constructor(
    private readonly agentRegistrationService: AgentRegistrationService,
  ) {}

  @Post(['auth/register-agent', 'api/auth/register-agent'])
  @Public()
  registerAgent(@Body() dto: CreateAgentRegistrationRequestDto) {
    return this.agentRegistrationService.createPublicRequest(dto);
  }

  @Get([
    'super-admin/agent-registration-requests',
    'api/super-admin/agent-registration-requests',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findRequests(@Query() query: QueryAgentRegistrationRequestsDto) {
    return this.agentRegistrationService.findRequests(query);
  }

  @Patch([
    'super-admin/agent-registration-requests/:id/approve',
    'api/super-admin/agent-registration-requests/:id/approve',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  approveRequest(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.agentRegistrationService.approveRequest(id, actor);
  }

  @Patch([
    'super-admin/agent-registration-requests/:id/reject',
    'api/super-admin/agent-registration-requests/:id/reject',
  ])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectAgentRegistrationRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.agentRegistrationService.rejectRequest(id, dto, actor);
  }
}
