import { IsBoolean } from 'class-validator';

export class ReactivateBotDto {
  @IsBoolean()
  botActive!: boolean;
}
