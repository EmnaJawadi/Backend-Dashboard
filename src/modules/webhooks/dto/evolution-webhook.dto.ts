import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class EvolutionWebhookMessageDto {
  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class EvolutionWebhookDto {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  instance?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsString()
  pushName?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  messages?: EvolutionWebhookMessageDto[];

  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}