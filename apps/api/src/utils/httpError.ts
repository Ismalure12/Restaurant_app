// An operational error a route turns into its HTTP status (thrown from inside
// a transaction so the whole write rolls back).
export const httpError = (message: string, httpStatus: number) => Object.assign(new Error(message), { httpStatus });
