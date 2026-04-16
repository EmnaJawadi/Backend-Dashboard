import { IsBoolean } from 'class-validator';

export class SetCompanyActivationDto {
  @IsBoolean()
  isActive!: boolean;
}
