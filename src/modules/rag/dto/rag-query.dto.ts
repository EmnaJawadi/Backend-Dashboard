import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RagHistoryItemDto {
  @IsString()
  @IsIn(['user', 'assistant', 'system'])
  role!: 'user' | 'assistant' | 'system';

  @IsString()
  content!: string;
}

export class RagQueryDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RagHistoryItemDto)
  history?: RagHistoryItemDto[];

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  companyId?: string;
}
