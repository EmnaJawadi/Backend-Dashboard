import { IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class ReviewPdfArticleDto {
  @IsIn(['approve', 'reject', 'edit'])
  action!: 'approve' | 'reject' | 'edit';

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  category?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  body?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
