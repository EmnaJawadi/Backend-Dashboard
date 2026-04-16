import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CheckWindowDto {
  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsISO8601()
  lastCustomerMessageAt?: string;
}
