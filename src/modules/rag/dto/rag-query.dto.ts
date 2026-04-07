import { IsArray, IsOptional, IsString } from 'class-validator';

export class RagQueryDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsArray()
  history?: string[];

  @IsOptional()
  @IsString()
  language?: string;
}