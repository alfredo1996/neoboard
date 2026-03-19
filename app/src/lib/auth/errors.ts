export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}
export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}
