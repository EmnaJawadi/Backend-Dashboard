import { IsBoolean } from 'class-validator';

export class SetUserActivationDto {
  @IsBoolean()
  isActive!: boolean;
}
