/**
 * ClickUp API v2 service helpers.
 * Base URL: https://api.clickup.com/api/v2
 * Auth header: Authorization: {api_token}  (no "Bearer" prefix)
 */

const BASE = "https://api.clickup.com/api/v2";

class ClickUpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = "ClickUpError";
  }
}

async function fetchCU(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let msg = `ClickUp API error ${res.status}`;
    try {
      const data = (await res.json()) as { err?: string; ECODE?: string };
      msg = data.err ?? msg;
    } catch { /* ignore parse failure */ }
    throw new ClickUpError(res.status, msg);
  }

  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface CUUser {
  id: number;
  username: string;
  email: string;
}

export async function getAuthorizedUser(token: string): Promise<CUUser> {
  const data = (await fetchCU(token, "GET", "/user")) as { user: CUUser };
  return data.user;
}

// ── Teams / workspaces ────────────────────────────────────────────────────────

export interface CUTeam {
  id: string;
  name: string;
}

export async function getTeams(token: string): Promise<CUTeam[]> {
  const data = (await fetchCU(token, "GET", "/team")) as { teams: CUTeam[] };
  return data.teams;
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export interface CUSpace {
  id: string;
  name: string;
}

export async function getSpaces(token: string, teamId: string): Promise<CUSpace[]> {
  const data = (await fetchCU(token, "GET", `/team/${teamId}/space?archived=false`)) as { spaces: CUSpace[] };
  return data.spaces;
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export interface CUList {
  id: string;
  name: string;
  folder?: { id: string; name: string };
  space?: { id: string; name: string };
}

export async function getSpaceLists(token: string, spaceId: string): Promise<CUList[]> {
  const [folderless, foldered] = await Promise.all([
    fetchCU(token, "GET", `/space/${spaceId}/list?archived=false`) as Promise<{ lists: CUList[] }>,
    fetchCU(token, "GET", `/space/${spaceId}/folder?archived=false`) as Promise<{ folders: Array<{ id: string; name: string; lists: CUList[] }> }>,
  ]);

  const allLists: CUList[] = [...(folderless.lists ?? [])];
  for (const folder of (foldered.folders ?? [])) {
    for (const list of folder.lists ?? []) {
      allLists.push({ ...list, folder: { id: folder.id, name: folder.name } });
    }
  }
  return allLists;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export interface CUCustomFieldOption {
  id: string;
  name: string;
  color?: string;
  orderindex: number;
}

export interface CUCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: {
    options?: CUCustomFieldOption[];
  };
}

export interface CUTask {
  id: string;
  name: string;
  description?: string;
  status: { status: string; type: string };
  due_date?: string | null;
  assignees?: Array<{ id: number; username: string; email: string }>;
  tags?: Array<{ name: string }>;
  date_created?: string;
  date_updated?: string;
  custom_fields?: CUCustomField[];
}

export async function getListTasks(token: string, listId: string): Promise<CUTask[]> {
  const allTasks: CUTask[] = [];
  let page = 0;
  while (true) {
    const data = (await fetchCU(
      token, "GET",
      `/list/${listId}/task?archived=false&include_closed=true&page=${page}`,
    )) as { tasks: CUTask[]; last_page?: boolean };
    allTasks.push(...(data.tasks ?? []));
    if (data.last_page || (data.tasks ?? []).length === 0) break;
    page++;
  }
  return allTasks;
}

export interface CreateCUTaskInput {
  name: string;
  description?: string;
  due_date?: number | null;
  status?: string;
  tags?: string[];
  assignees?: number[];
}

export async function createTask(token: string, listId: string, input: CreateCUTaskInput): Promise<CUTask> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.description) body["description"] = input.description;
  if (input.due_date != null) body["due_date"] = input.due_date;
  if (input.status) body["status"] = input.status;
  if (input.tags?.length) body["tags"] = input.tags;
  if (input.assignees?.length) body["assignees"] = input.assignees;
  const data = (await fetchCU(token, "POST", `/list/${listId}/task`, body)) as CUTask;
  return data;
}

export interface UpdateCUTaskInput {
  name?: string;
  description?: string;
  due_date?: number | null;
  due_date_time?: boolean;
  status?: string;
  tags?: string[];
}

export async function updateTask(token: string, taskId: string, input: UpdateCUTaskInput): Promise<CUTask> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body["name"] = input.name;
  if (input.description !== undefined) body["description"] = input.description;
  if ("due_date" in input) {
    body["due_date"] = input.due_date;
    body["due_date_time"] = false;
  }
  if (input.status !== undefined) body["status"] = input.status;

  const data = (await fetchCU(token, "PUT", `/task/${taskId}`, body)) as CUTask;

  // Tags are updated separately via tag endpoints
  if (input.tags !== undefined) {
    try {
      // Get current task tags and remove old ones, then add new ones
      const task = data;
      const existingTags = (task.tags ?? []).map(t => t.name);
      const newTags = input.tags;
      const toRemove = existingTags.filter(t => !newTags.includes(t));
      const toAdd = newTags.filter(t => !existingTags.includes(t));
      await Promise.all([
        ...toRemove.map(t => fetchCU(token, "DELETE", `/task/${taskId}/tag/${encodeURIComponent(t)}`)),
        ...toAdd.map(t => fetchCU(token, "POST", `/task/${taskId}/tag/${encodeURIComponent(t)}`)),
      ]);
    } catch { /* tag sync is best-effort */ }
  }
  return data;
}

/** Fetch all custom field definitions for a list */
export async function getListCustomFields(token: string, listId: string): Promise<CUCustomField[]> {
  const data = (await fetchCU(token, "GET", `/list/${listId}/field`)) as { fields: CUCustomField[] };
  return data.fields ?? [];
}

/** Set a custom field value on a task */
export async function setTaskCustomField(token: string, taskId: string, fieldId: string, value: unknown): Promise<void> {
  await fetchCU(token, "POST", `/task/${taskId}/field/${fieldId}`, { value });
}

/** Find the "Service Type" field config from a list's custom fields */
export function findServiceTypeField(fields: CUCustomField[]): { fieldId: string; options: CUCustomFieldOption[] } | null {
  const field = fields.find(f => f.name.toLowerCase().replace(/[_\s]+/g, " ").trim() === "service type");
  if (!field) return null;
  return { fieldId: field.id, options: field.type_config?.options ?? [] };
}

/** Extract local service_type value from a task's custom_fields array */
export function cuCustomFieldToServiceType(customFields?: CUCustomField[]): "Bookkeeping" | "Virtual Assistant" | null {
  if (!customFields) return null;
  const field = customFields.find(f => f.name.toLowerCase().replace(/[_\s]+/g, " ").trim() === "service type");
  if (!field || field.value === null || field.value === undefined || field.value === "") return null;
  // For drop_down fields, value is the orderindex (number) of the selected option
  const orderindex = typeof field.value === "number" ? field.value : parseInt(String(field.value), 10);
  if (isNaN(orderindex)) return null;
  const option = field.type_config?.options?.find(o => o.orderindex === orderindex);
  const name = (option?.name ?? "").toLowerCase().trim();
  if (name.includes("bookkeeping")) return "Bookkeeping";
  if (name.includes("virtual") || name.includes("va")) return "Virtual Assistant";
  return null;
}

/** Map a local service_type to the ClickUp dropdown option orderindex for a list's field */
export function serviceTypeToOrderindex(serviceType: string | null | undefined, options: CUCustomFieldOption[]): number | null {
  if (!serviceType) return null;
  const normalized = serviceType.toLowerCase().trim();
  const option = options.find(o => o.name.toLowerCase().trim() === normalized);
  return option?.orderindex ?? null;
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface CUComment {
  id: string;
  comment_text: string;
  user: { id: number; username: string; email: string };
  date: string;
}

export async function getTaskComments(token: string, taskId: string): Promise<CUComment[]> {
  const data = (await fetchCU(token, "GET", `/task/${taskId}/comment`)) as { comments: CUComment[] };
  return data.comments ?? [];
}

export async function createComment(token: string, taskId: string, text: string): Promise<CUComment> {
  const data = (await fetchCU(token, "POST", `/task/${taskId}/comment`, { comment_text: text, notify_all: false })) as CUComment;
  return data;
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

export interface CUWebhook {
  id: string;
  endpoint: string;
  events: string[];
}

export async function registerWebhook(
  token: string,
  teamId: string,
  endpoint: string,
): Promise<{ id: string; secret: string }> {
  const data = (await fetchCU(token, "POST", `/team/${teamId}/webhook`, {
    endpoint,
    events: ["*"],
  })) as { id: string; webhook: { id: string; secret: string } };
  const id = data.webhook?.id ?? data.id;
  const secret = data.webhook?.secret ?? (data as any).secret ?? "";
  return { id, secret };
}

export async function deleteWebhook(token: string, webhookId: string): Promise<void> {
  await fetchCU(token, "DELETE", `/webhook/${webhookId}`);
}

// ── Status mapping ────────────────────────────────────────────────────────────

export interface CUStatus {
  status: string;
  type: string;   // "open" | "custom" | "closed" | "done"
  color?: string;
}

/** Fetch the statuses configured for a list */
export async function getListStatuses(token: string, listId: string): Promise<CUStatus[]> {
  const data = (await fetchCU(token, "GET", `/list/${listId}`)) as { statuses?: CUStatus[] };
  return data.statuses ?? [];
}

/** Simple best-effort map of local status → ClickUp status name (no list context).
 *  Use localStatusToCUActual when you have the list's real statuses available. */
export function localStatusToCU(localStatus: string): string {
  switch (localStatus) {
    case "Completed":        return "complete";
    case "In Progress":      return "in progress";
    case "Pending":          return "pending";
    case "Confirmed":        return "confirmed";
    case "Needs SMR Review": return "needs smr review";
    case "To Discuss":       return "to discuss";
    default:                 return "open";
  }
}

/** Map a ClickUp status string to a local task status */
export function cuStatusToLocal(cuStatus: string): string {
  const s = cuStatus.toLowerCase().replace(/[_\s-]+/g, " ").trim();
  if (["complete", "completed", "done", "closed", "resolved"].includes(s)) return "Completed";
  if (["in progress", "inprogress", "active", "in review", "review"].includes(s)) return "In Progress";
  if (["pending", "waiting", "on hold", "blocked", "deferred"].includes(s)) return "Pending";
  if (["confirmed", "approved", "accepted"].includes(s)) return "Confirmed";
  if (["needs smr review", "smr review", "needs review"].includes(s)) return "Needs SMR Review";
  if (["to discuss", "discuss"].includes(s)) return "To Discuss";
  return "Not Started";
}

/** Map a local task status to the best-matching actual ClickUp status name.
 *  Falls back to the first status of the appropriate type if no name match found. */
export function localStatusToCUActual(localStatus: string, cuStatuses: CUStatus[]): string | undefined {
  if (cuStatuses.length === 0) return undefined;

  // Build keyword candidates in priority order
  const candidates: string[][] = {
    "Completed":        [["complete", "done", "closed", "resolved", "finished"]],
    "In Progress":      [["in progress", "inprogress", "active", "started", "in review"]],
    "Pending":          [["pending", "waiting", "on hold", "blocked"]],
    "Confirmed":        [["confirmed", "approved", "accepted"]],
    "Not Started":      [["open", "not started", "to do", "todo", "backlog", "new"]],
    "Needs SMR Review": [["needs smr review", "smr review", "needs review"]],
    "To Discuss":       [["to discuss", "discuss"]],
  }[localStatus] ?? [[]];

  const keywords = candidates[0] ?? [];

  // Try exact/substring name match first
  for (const kw of keywords) {
    const found = cuStatuses.find(s => s.status.toLowerCase().replace(/[_\s-]+/g, " ").trim().includes(kw));
    if (found) return found.status;
  }

  // Fall back to type-based match
  const typeMap: Record<string, string> = {
    "Completed": "closed",
    "In Progress": "custom",
    "Not Started": "open",
  };
  const targetType = typeMap[localStatus];
  if (targetType) {
    const byType = cuStatuses.find(s => s.type === targetType);
    if (byType) return byType.status;
  }

  return undefined; // don't send status if we can't match safely
}

/** Convert a YYYY-MM-DD string to ClickUp's ms timestamp, or null */
export function dateToMs(date: string | null | undefined): number | null {
  if (!date) return null;
  return new Date(date + "T00:00:00Z").getTime();
}

/** Convert ClickUp ms timestamp to YYYY-MM-DD, or null */
export function msToDate(ms: string | number | null | undefined): string | null {
  if (!ms) return null;
  const d = new Date(Number(ms));
  return d.toISOString().split("T")[0]!;
}
