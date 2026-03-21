import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { z } from "zod";

const router: IRouter = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1),
  role: z.enum(["admin", "team_member", "client"]),
  client_id: z.number().int().nullable().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(["admin", "team_member", "client"]).optional(),
  client_id: z.number().int().nullable().optional(),
  password: z.string().min(6).optional(),
});

router.get("/users", requireAdmin, async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      client_id: usersTable.client_id,
      client_name: clientsTable.name,
    })
    .from(usersTable)
    .leftJoin(clientsTable, eq(usersTable.client_id, clientsTable.id))
    .orderBy(usersTable.name);
  res.json(users);
});

router.post("/users", requireAdmin, async (req, res) => {
  const body = createUserSchema.parse(req.body);
  const hash = await bcrypt.hash(body.password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({
      email: body.email.toLowerCase(),
      password_hash: hash,
      name: body.name,
      role: body.role,
      client_id: body.client_id ?? null,
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      client_id: usersTable.client_id,
    });
  res.status(201).json(user);
});

router.patch("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"]!);
  const body = updateUserSchema.parse(req.body);

  const updates: Record<string, unknown> = {};
  if (body.name) updates["name"] = body.name;
  if (body.email) updates["email"] = body.email.toLowerCase();
  if (body.role) updates["role"] = body.role;
  if ("client_id" in body) updates["client_id"] = body.client_id ?? null;
  if (body.password) updates["password_hash"] = await bcrypt.hash(body.password, 12);

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      name: usersTable.name,
      role: usersTable.role,
      client_id: usersTable.client_id,
    });

  if (!updated) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(updated);
});

router.delete("/users/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"]!);
  if (req.session.user?.id === id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

export default router;
