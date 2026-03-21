import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, subtasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  UpdateTaskParams,
  ListTasksQueryParams,
  ListTasksResponse,
  UpdateTaskResponse,
  ListSubtasksParams,
  CreateSubtaskBody,
  CreateSubtaskParams,
  UpdateSubtaskBody,
  UpdateSubtaskParams,
  DeleteSubtaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tasks", async (req, res) => {
  const query = ListTasksQueryParams.parse(req.query);

  let rows;
  if (query.clientId) {
    rows = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        client_id: tasksTable.client_id,
        assigned_to: tasksTable.assigned_to,
        status: tasksTable.status,
        due_date: tasksTable.due_date,
        client_name: clientsTable.name,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
      .where(eq(tasksTable.client_id, query.clientId))
      .orderBy(tasksTable.id);
  } else {
    rows = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        client_id: tasksTable.client_id,
        assigned_to: tasksTable.assigned_to,
        status: tasksTable.status,
        due_date: tasksTable.due_date,
        client_name: clientsTable.name,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
      .orderBy(tasksTable.id);
  }

  const parsed = ListTasksResponse.parse(rows);
  res.json(parsed);
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.parse(req.body);
  const [task] = await db.insert(tasksTable).values(body).returning();
  res.status(201).json(task);
});

router.patch("/tasks/:id", async (req, res) => {
  const { id } = UpdateTaskParams.parse(req.params);
  const body = UpdateTaskBody.parse(req.body);

  const [updated] = await db
    .update(tasksTable)
    .set(body)
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const parsed = UpdateTaskResponse.parse(updated);
  res.json(parsed);
});

// Subtask routes
router.get("/tasks/:taskId/subtasks", async (req, res) => {
  const { taskId } = ListSubtasksParams.parse(req.params);
  const rows = await db
    .select()
    .from(subtasksTable)
    .where(eq(subtasksTable.task_id, taskId))
    .orderBy(subtasksTable.id);
  res.json(rows);
});

router.post("/tasks/:taskId/subtasks", async (req, res) => {
  const { taskId } = CreateSubtaskParams.parse(req.params);
  const body = CreateSubtaskBody.parse(req.body);
  const [subtask] = await db
    .insert(subtasksTable)
    .values({ task_id: taskId, title: body.title })
    .returning();
  res.status(201).json(subtask);
});

router.patch("/subtasks/:id", async (req, res) => {
  const { id } = UpdateSubtaskParams.parse(req.params);
  const body = UpdateSubtaskBody.parse(req.body);

  const [updated] = await db
    .update(subtasksTable)
    .set(body)
    .where(eq(subtasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Subtask not found" });
    return;
  }

  res.json(updated);
});

router.delete("/subtasks/:id", async (req, res) => {
  const { id } = DeleteSubtaskParams.parse(req.params);
  await db.delete(subtasksTable).where(eq(subtasksTable.id, id));
  res.status(204).send();
});

export default router;
