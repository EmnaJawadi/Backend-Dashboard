export class StructuredOutputDto<T = Record<string, unknown>> {
  success!: boolean;
  data!: T | null;
  rawText!: string;
  error!: string | null;

  constructor(partial: Partial<StructuredOutputDto<T>>) {
    Object.assign(this, partial);
  }
}