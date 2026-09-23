import type { Request, Response } from 'express';

export type Handler = (req: Request<any>, res: Response) => Promise<unknown> | unknown;

/** The handlers one URL answers, by HTTP method (see routes/defineRoute.ts). */
export interface RouteHandlers {
  GET?: Handler;
  POST?: Handler;
  PUT?: Handler;
  PATCH?: Handler;
  DELETE?: Handler;
}

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
