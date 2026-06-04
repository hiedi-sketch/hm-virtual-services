import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { fileUploadsTable, clientsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// Uploads directory lives alongside the built dist/ folder
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIMETYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",                                                        // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  // .docx
  "application/vnd.ms-excel",                                                 // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
  "text/csv",
  "text/plain",
]);

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Accepted: PDF, images, Word, Excel, CSV, TXT.`));
    }
  },
});

// POST /api/uploads — upload a file
// Client: uses their own client_id from session; admin/team: must pass client_id in form
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
        fs.unlinkSync(req.file.path);
        res.status(403).json({ error: "No client account linked." });
        return;
      }
      clientId = user.client_id;
    } else {
      // admin / team_member must supply client_id as a query param (?client_id=N)
      // or as a form field in the multipart body (legacy fallback)
      const rawId = req.query["client_id"] ?? req.body?.client_id;
      clientId = parseInt(rawId as string, 10);
      if (isNaN(clientId) || clientId <= 0) {
        fs.unlinkSync(req.file.path);
        res.status(400).json({ error: "client_id is required." });
        return;
      }
    }

    try {
      const [record] = await db
        .insert(fileUploadsTable)
        .values({
          client_id: clientId,
          uploaded_by_user_id: user.id,
          original_name: req.file.originalname,
          stored_name: req.file.filename,
          mimetype: req.file.mimetype,
          size_bytes: req.file.size,
        })
        .returning();

      logAudit("file_upload", record.id, "created", `File "${req.file.originalname}" uploaded`, {
        id: user.id,
        name: user.name,
      });

      res.status(201).json(record);
    } catch (dbErr) {
      fs.unlinkSync(req.file.path);
      throw dbErr;
    }
  });
});

// GET /api/uploads — list uploads
// Clients see only their own; admin/team can filter by ?client_id=
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

// GET /api/uploads/:id/download — serve the file
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

  // Clients can only download their own files
  if (user.role === "client" && record.client_id !== user.client_id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, record.stored_name);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File missing from storage" });
    return;
  }

  res.setHeader("Content-Disposition", `attachment; filename="${record.original_name}"`);
  res.setHeader("Content-Type", record.mimetype);
  res.sendFile(filePath);
});

// GET /api/uploads/:id/preview — serve inline (no download prompt)
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

  const filePath = path.join(UPLOADS_DIR, record.stored_name);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "File missing from storage" }); return; }

  res.setHeader("Content-Disposition", `inline; filename="${record.original_name}"`);
  res.setHeader("Content-Type", record.mimetype);
  res.sendFile(filePath);
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

  const filePath = path.join(UPLOADS_DIR, record.stored_name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  logAudit("file_upload", id, "deleted", `File "${record.original_name}" deleted`, {
    id: user.id,
    name: user.name,
  });

  res.status(204).send();
});

export default router;
