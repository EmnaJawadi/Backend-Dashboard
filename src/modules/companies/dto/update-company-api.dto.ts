import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyApiDto } from './create-company-api.dto';

export class UpdateCompanyApiDto extends PartialType(CreateCompanyApiDto) {}
