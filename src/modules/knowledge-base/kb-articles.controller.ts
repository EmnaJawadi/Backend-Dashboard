import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { KbArticlesService } from './kb-articles.service';
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';
import { PublishKbArticleDto } from './dto/publish-kb-article.dto';
import { KbArticleQueryDto } from './dto/kb-article-query.dto';
import { IngestKbFileDto } from './dto/ingest-kb-file.dto';
import { IngestKbSourceDto } from './dto/ingest-kb-source.dto';
import { KbChunksService } from './kb-chunks.service';

@Controller('knowledge-base/articles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.AGENT)
export class KbArticlesController {
  constructor(
    private readonly kbArticlesService: KbArticlesService,
    private readonly kbChunksService: KbChunksService,
  ) {}

  @Post()
  create(
    @Body() createKbArticleDto: CreateKbArticleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.create(createKbArticleDto, actor);
  }

  @Post('ingest')
  ingest(
    @Body() ingestKbSourceDto: IngestKbSourceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.ingest(ingestKbSourceDto, actor);
  }

  @Post('ingest/file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  ingestFile(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @Body() ingestKbFileDto: IngestKbFileDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }

    return this.kbArticlesService.ingestFile(file, ingestKbFileDto, actor);
  }

  @Get()
  findAll(
    @Query() query: KbArticleQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.findAll(query, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.kbArticlesService.findOne(id, actor);
  }

  @Get(':id/chunks')
  findChunks(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.kbChunksService.findByArticleId(
      id,
      actor.role === UserRole.SUPER_ADMIN ? undefined : actor.companyId ?? undefined,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateKbArticleDto: UpdateKbArticleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.update(id, updateKbArticleDto, actor);
  }

  @Patch(':id/publish')
  publish(
    @Param('id') id: string,
    @Body() publishKbArticleDto: PublishKbArticleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.kbArticlesService.publish(id, publishKbArticleDto, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.kbArticlesService.remove(id, actor);
  }
}
