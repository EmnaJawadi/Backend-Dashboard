import { IsOptional, IsString } from 'class-validator';

export class AssignConversationDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  userName?: string;
}
