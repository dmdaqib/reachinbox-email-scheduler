declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      avatarUrl?: string | null;
      googleId?: string;
    }

    interface Request {
      isAuthenticated?: () => boolean;
      user?: Express.User;
    }
  }
}

export {};
