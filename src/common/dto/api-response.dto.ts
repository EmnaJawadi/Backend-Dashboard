export class ApiResponseDto<T> {
  success!: boolean;
  data?: T;
  message?: string;
  meta?: any;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    Object.assign(this, partial);
  }
}