import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishKbArticleDto {
  @IsOptional()
  @IsBoolean()
  published?: boolean = true;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}