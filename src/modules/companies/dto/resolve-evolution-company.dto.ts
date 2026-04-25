import { IsString } from 'class-validator';

export class ResolveEvolutionCompanyDto {
  @IsString()
  instance!: string;
}
