import { IsString, MaxLength } from 'class-validator';

export class NeedsMoreInfoCompanyRegistrationRequestDto {
  @IsString()
  @MaxLength(1200)
  infoRequest!: string;
}
