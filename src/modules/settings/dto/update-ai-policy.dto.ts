import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateAiPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  handoffEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  handoffThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  escalationDelayMinutes?: number;

  @IsOptional()
  @IsString()
  responseTone?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  systemInstruction?: string;
}
