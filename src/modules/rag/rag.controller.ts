import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { resolveCompanyScope } from '../../common/utils/company-scope.util';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagService } from './rag.service';

@Controller(['rag', 'api/rag'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('search')
  search(@Body() dto: RagQueryDto, @CurrentUser() actor: AuthenticatedUser) {
    const companyId = resolveCompanyScope(actor) ?? dto.companyId?.trim();

    if (!companyId) {
      throw new BadRequestException('companyId is required for RAG search');
    }

    return this.ragService.query({
      ...dto,
      companyId,
    });
  }
}
