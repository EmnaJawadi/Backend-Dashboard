import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { AiService } from './ai.service';
import { AiReplyRequestDto } from './dto/ai-reply-request.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('reply')
  generateReply(
    @Body() payload: AiReplyRequestDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.aiService.generateReply(payload, actor);
  }

  @Post('structured-output')
  @Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN)
  generateStructuredOutput(@Body() body: { prompt: string }) {
    return this.aiService.generateStructuredOutput(body.prompt);
  }
}
