import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export enum KbArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum KbArticleSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  PUBLISHED_AT = 'publishedAt',
  TITLE = 'title',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class KbArticleQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  search?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  tag?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language?: string;

  @IsOptional()
  @IsEnum(KbArticleStatus)
  status?: KbArticleStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsEnum(KbArticleSortBy)
  sortBy?: KbArticleSortBy = KbArticleSortBy.CREATED_AT;

  @IsOptional()
  @Transform(({ value }) => String(value).toLowerCase())
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;
}