import type { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({ message: 'Not found' });
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  return res.status(500).json({ message: err.message || 'Internal server error' });
}
