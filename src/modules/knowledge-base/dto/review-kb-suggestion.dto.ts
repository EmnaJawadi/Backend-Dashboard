import { IsArray, IsOptional, IsString } from 'class-validator';

export class ReviewKbSuggestionDto {
  @IsOptional()
  @IsString()
  reviewedBy?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
