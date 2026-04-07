export class RagResultDto {
  answer!: string;
  context!: string;
  sources!: string[];

  constructor(partial: Partial<RagResultDto>) {
    Object.assign(this, partial);
  }
}