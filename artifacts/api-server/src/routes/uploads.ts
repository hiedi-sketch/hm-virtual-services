import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "@workspace/db";
import { fileUploadsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { uploadToGcs, streamFromGcs, deleteFromGcs, GCS_PREFIX } from "../lib/gcsUpload";

const router: IRouter = Router();

// Legacy disk directory — still used as a fallback for pre-GCS files
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIMETYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// Memory storage — files are buffered in RAM and pushed to GCS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Accepted: PDF, images, Word, Excel, CSV, TXT."));
    }
  },
});

// ── Serve helper ────────────────────────────────────────────────────────────
async function serveFile(
  record: { stored_name: string; original_name: string; mimetype: string },
  res: any,
  disposition: "inline" | "attachment"
) {
  if (record.stored_name.startsWith(GCS_PREFIX)) {
    // New GCS-backed file
    await streamFromGcs(record.stored_name, res, disposition, record.original_name, record.mimetype);
  } else {
    // Legacy disk file
    const filePath = path.join(UPLOADS_DIR, record.stored_name);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File missing from storage" });
      return;
    }
    res.setHeader("Content-Disposition", `${disposition}; filename="${record.original_name}"`);
    res.setHeader("Content-Type", record.mimetype);
    res.sendFile(filePath);
  }
}

// POST /api/uploads — upload a file (stored in GCS)
router.post("/uploads", requireAuth, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File too large. Maximum size is 10 MB." });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file provided." });
      return;
    }

    const user = req.session.user!;
    let clientId: number;

    if (user.role === "client") {
      if (!user.client_id) {
        res.status(403).json({ error: "No client account linked." });
        return;
      }
      clientId = user.client_id;
    } else {
      const rawId = req.query["client_id"] ?? req.body?.client_id;
      clientId = parseInt(rawId as string, 10);
      if (isNaN(clientId) || clientId <= 0) {
        res.status(400).json({ error: "client_id is required." });
        return;
      }
    }

    try {
      // Upload buffer to GCS
      const gcsStoredName = await uploadToGcs(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );

      const [record] = await db
        .insert(fileUploadsTable)
        .values({
          client_id: clientId,
          uploaded_by_user_id: user.id,
          original_name: req.file.originalname,
          stored_name: gcsStoredName,
          mimetype: req.file.mimetype,
          size_bytes: req.file.size,
        })
        .returning();

      logAudit("file_upload", record.id, "created", `File "${req.file.originalname}" uploaded`, {
        id: user.id,
        name: user.name,
      });

      res.status(201).json(record);
    } catch (uploadErr: any) {
      res.status(500).json({ error: `Upload failed: ${uploadErr?.message ?? "unknown error"}` });
    }
  });
});

// GET /api/uploads — list uploads
router.get("/uploads", requireAuth, async (req, res) => {
  const user = req.session.user!;

  let rows;
  if (user.role === "client") {
    if (!user.client_id) { res.json([]); return; }
    rows = await db
      .select()
      .from(fileUploadsTable)
      .where(eq(fileUploadsTable.client_id, user.client_id))
      .orderBy(desc(fileUploadsTable.created_at));
  } else {
    const clientIdParam = req.query["client_id"];
    if (clientIdParam) {
      const cid = parseInt(clientIdParam as string, 10);
      rows = await db
        .select()
        .from(fileUploadsTable)
        .where(eq(fileUploadsTable.client_id, cid))
        .orderBy(desc(fileUploadsTable.created_at));
    } else {
      rows = await db
        .select()
        .from(fileUploadsTable)
        .orderBy(desc(fileUploadsTable.created_at))
        .limit(200);
    }
  }

  res.json(rows);
});

// GET /api/uploads/:id/download
router.get("/uploads/:id/download", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"]!);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.session.user!;
  const [record] = await db
    .select()
    .from(fileUploadsTable)
    .where(eq(fileUploadsTable.id, id))
    .limit(1);

  if (!record) { res.status(404).json({ error: "File not found" }); return; }

  if (user.role === "client" && record.client_id !== user.client_id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await serveFile(record, res, "attachment");
});

// GET /api/uploads/:id/preview — serve inline
router.get("/uploads/:id/preview", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"]!);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const user = req.session.user!;
  const [record] = await db
    .select()
    .from(fileUploadsTable)
    .where(eq(fileUploadsTable.id, id))
    .limit(1);

  if (!record) { res.status(404).json({ error: "File not found" }); return; }

  if (user.role === "client" && record.client_id !== user.client_id) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  await serveFile(record, res, "inline");
});

// DELETE /api/uploads/:id — admin only
router.delete("/uploads/:id", requireAuth, async (req, res) => {
  const user = req.session.user!;
  if (user.role !== "admin") { res.status(403).json({ error: "Admins only" }); return; }

  const id = parseInt(req.params["id"]!);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [record] = await db
    .select()
    .from(fileUploadsTable)
    .where(eq(fileUploadsTable.id, id))
    .limit(1);

  if (!record) { res.status(404).json({ error: "File not found" }); return; }

  await db.delete(fileUploadsTable).where(eq(fileUploadsTable.id, id));

  if (record.stored_name.startsWith(GCS_PREFIX)) {
    await deleteFromGcs(record.stored_name).catch(() => {});
  } else {
    const filePath = path.join(UPLOADS_DIR, record.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  logAudit("file_upload", id, "deleted", `File "${record.original_name}" deleted`, {
    id: user.id,
    name: user.name,
  });

  res.status(204).send();
});

export default router;
