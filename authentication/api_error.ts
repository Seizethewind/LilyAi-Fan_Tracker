export class ApiError extends Error {
  status: number;
  code: string;
  headers: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    headers: Record<string, string> = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}
