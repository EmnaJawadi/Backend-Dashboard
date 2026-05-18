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
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotifyAdminDto } from './dto/notify-admin.dto';
import { NotifyAgentAssignedDto } from './dto/notify-agent-assigned.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller(['notifications', 'api/notifications'])
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post()
  create(
    @Body() payload: CreateNotificationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.create(payload, actor);
  }

  @Get()
  findAll(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.findAll(query, actor);
  }

  @Patch('read-all')
  markAllAsRead(
    @Query() query: QueryNotificationsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markAllAsRead(query, actor);
  }

  @Patch(':id/read')
  markAsRead(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsRead(id, actor);
  }

  @Post('agent-assigned')
  @Public()
  @UseGuards(ApiKeyGuard)
  notifyAgentAssigned(@Body() payload: NotifyAgentAssignedDto) {
    return this.notificationsService.notifyAgentAssigned(payload);
  }

  @Post('admin')
  @Public()
  @UseGuards(ApiKeyGuard)
  notifyAdmin(@Body() payload: NotifyAdminDto) {
    return this.notificationsService.notifyAdmin(payload);
  }
}
