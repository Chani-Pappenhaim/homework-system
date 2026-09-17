// Separates the technical error (English, for logs/debugging) from the
// message actually shown to the client (Hebrew, always safe to display).
export class AppError extends Error {
  status: number;
  clientMessage: string;

  constructor(devMessage: string, clientMessage: string, status: number) {
    super(devMessage);
    this.clientMessage = clientMessage;
    this.status = status;
  }
}
