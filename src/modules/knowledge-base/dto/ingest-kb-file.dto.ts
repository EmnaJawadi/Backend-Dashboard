import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function toTagArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

export class IngestKbFileDto {
  @IsOptional()
  @IsString()
  @Length(3, 150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  @Length(2, 10)
  language?: string;

  @IsOptional()
  @Transform(({ value }) => toTagArray(value))
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
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  autoPublish?: boolean = false;
}
