// `catch (error)` is `unknown` in TS; the Next routes read `error.code`
// (Prisma P2002/P2025…) and `error.message` directly. These keep that access
// identical without sprinkling casts through every handler.
export const errCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
export const errMessage = (e: unknown): string | undefined => (e as { message?: string } | null)?.message;
