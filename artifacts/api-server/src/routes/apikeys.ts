import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomBytes } from "crypto";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

// ── GET /api/apikeys — list all keys (admin only) ────────────────────────────
router.get("/apikeys", requireAdmin, async (_req, res) => {
  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      key_preview: apiKeysTable.key,
      created_at: apiKeysTable.created_at,
    })
    .from(apiKeysTable)
    .orderBy(apiKeysTable.created_at);

  const masked = keys.map(k => ({
    id: k.id,
    name: k.name,
    key_preview: k.key_preview.slice(0, 10) + "…",
    created_at: k.created_at,
  }));

  res.json(masked);
});

// ── POST /api/apikeys — create a new key (admin only) ───────────────────────
router.post("/apikeys", requireAdmin, async (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const raw = "fs_" + randomBytes(24).toString("hex");
  const created_at = new Date().toISOString();

  await db.insert(apiKeysTable).values({ name: name.trim(), key: raw, created_at });

  const [saved] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, raw))
    .limit(1);

  res.status(201).json({
    id: saved.id,
    name: saved.name,
    key: raw,
    created_at: saved.created_at,
  });
});

// ── DELETE /api/apikeys/:id — revoke a key (admin only) ─────────────────────
router.delete("/apikeys/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, id));
  res.json({ ok: true });
});

export default router;
