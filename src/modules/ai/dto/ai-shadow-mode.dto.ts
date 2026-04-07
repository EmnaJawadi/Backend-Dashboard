import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AiShadowModeDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}