import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateKbArticleDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(3, 180)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsString()
  @IsNotEmpty()
  @Length(20, 50000)
  content!: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language?: string;

  @IsOptional()
  @IsUrl(
    { require_tld: false },
    { message: 'sourceUrl must be a valid URL' },
  )
  sourceUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}