import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export enum KbIngestSourceType {
  URL = 'url',
  TEXT = 'text',
  FILE = 'file',
}

export class IngestKbSourceDto {
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsEnum(KbIngestSourceType)
  sourceType!: KbIngestSourceType;

  @IsOptional()
  @IsString()
  @Length(3, 150)
  title?: string;

  @ValidateIf((o) => o.sourceType === KbIngestSourceType.URL)
  @IsUrl(
    { require_tld: false },
    { message: 'sourceUrl must be a valid URL when sourceType is url' },
  )
  sourceUrl?: string;

  @ValidateIf((o) => o.sourceType === KbIngestSourceType.TEXT)
  @IsString()
  @IsNotEmpty()
  @Length(20, 100000)
  rawContent?: string;

  @ValidateIf((o) => o.sourceType === KbIngestSourceType.FILE)
  @IsString()
  @IsNotEmpty()
  fileId?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(5000)
  chunkSize?: number = 1000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  chunkOverlap?: number = 100;

  @IsOptional()
  @IsBoolean()
  autoPublish?: boolean = true;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
