import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { PdfImportService } from './pdf-import.service';
import { ReviewPdfArticleDto } from './dto/review-pdf-article.dto';
import { QueryPdfImportsDto } from './dto/query-pdf-imports.dto';
import { FileSecurityService } from './ingestion/file-security.service';

@Controller('knowledge-base/pdf-imports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY_ADMIN)
export class PdfImportController {
  constructor(
    private readonly pdfImportService: PdfImportService,
    private readonly fileSecurityService: FileSecurityService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (
        _req,
        file: { mimetype: string; originalname: string },
        cb: (error: Error | null, accept: boolean) => void,
      ) => {
        if (
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf')
        ) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Seuls les fichiers PDF sont acceptes.'), false);
        }
      },
    }),
  )
  async upload(
    @UploadedFile()
    file:
      | { buffer: Buffer; originalname: string; mimetype: string; size: number }
      | undefined,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Un fichier PDF est requis.');
    }
    await this.fileSecurityService.validate(file, ['.pdf']);
    return this.pdfImportService.uploadAndAnalyze(file, actor);
  }

  @Get()
  listImports(
    @Query() query: QueryPdfImportsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pdfImportService.listImports(query, actor);
  }

  @Get(':importId')
  getImport(
    @Param('importId') importId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pdfImportService.getImport(importId, actor);
  }

  @Patch(':importId/articles/:articleId')
  reviewArticle(
    @Param('importId') importId: string,
    @Param('articleId') articleId: string,
    @Body() dto: ReviewPdfArticleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.pdfImportService.reviewArticle(importId, articleId, dto, actor);
  }
}
