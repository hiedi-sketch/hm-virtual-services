import "express-session";

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      email: string;
      name: string;
      role: "admin" | "team_member" | "client";
      client_id: number | null;
    };
    lastActivity: number;
  }
}
