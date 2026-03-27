import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { sendMail, template } from "../lib/mailer";

const router: IRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.json(req.session.user);
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const body = loginSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid email or password format" });
    return;
  }

  const { email, password } = body.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as "admin" | "team_member" | "client",
    client_id: user.client_id ?? null,
  };
  req.session.lastActivity = Date.now();

  res.json(req.session.user);
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).send();
  });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res) => {
  const body = forgotSchema.safeParse(req.body);
  if (!body.success) {
    // Always respond 200 to avoid email enumeration
    res.json({ ok: true });
    return;
  }

  const { email } = body.data;

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));

    if (user) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokensTable).values({
        user_id: user.id,
        token,
        expires_at: expiresAt,
        used: false,
      });

      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.APP_URL ?? "http://localhost:3000");
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      await sendMail(
        user.email,
        "Reset your HM Virtual Services Business Suite password",
        template(`
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in <strong>1 hour</strong>.</p>
          <p style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="display:inline-block;background:#266b75;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Reset Password</a>
          </p>
          <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email. Your password will not change.</p>
          <p style="color:#64748b;font-size:13px;">Or copy and paste this link into your browser:<br><a href="${resetUrl}" style="color:#266b75;word-break:break-all;">${resetUrl}</a></p>
        `)
      );
    }
  } catch (err) {
    // Never expose whether the email exists
  }

  res.json({ ok: true });
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res) => {
  const body = resetSchema.safeParse(req.body);
  if (!body.success) {
    const msg = body.error.errors[0]?.message ?? "Invalid request";
    res.status(400).json({ error: msg });
    return;
  }

  const { token, password } = body.data;
  const now = new Date();

  const [record] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.token, token),
        eq(passwordResetTokensTable.used, false),
        gt(passwordResetTokensTable.expires_at, now)
      )
    );

  if (!record) {
    res.status(400).json({ error: "This reset link is invalid or has expired." });
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  await db
    .update(usersTable)
    .set({ password_hash: hash })
    .where(eq(usersTable.id, record.user_id));

  await db
    .update(passwordResetTokensTable)
    .set({ used: true })
    .where(eq(passwordResetTokensTable.id, record.id));

  res.json({ ok: true });
});

export default router;
