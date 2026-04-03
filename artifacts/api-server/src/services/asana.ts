/**
 * Asana API service
 * Wraps the Asana REST API v1.0 using the Personal Access Token (PAT) auth model.
 * All requests go through fetchAsana() which attaches the Bearer token and handles
 * common error shapes returned by the API.
 */

const ASANA_BASE = "https://app.asana.com/api/1.0";

export interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  assignee: { gid: string; name: string } | null;
}

export interface AsanaError extends Error {
  statusCode?: number;
  asanaErrors?: { message: string }[];
}

/** Perform an authenticated Asana API request. */
async function fetchAsana<T>(
  path: string,
  pat: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${ASANA_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    const err: AsanaError = new Error(`Asana API HTTP ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  if (!res.ok) {
    const errors = (body["errors"] as { message: string }[] | undefined) ?? [];
    const message =
      errors[0]?.message ?? `Asana API error (HTTP ${res.status})`;
    const err: AsanaError = new Error(message);
    err.statusCode = res.status;
    err.asanaErrors = errors;
    throw err;
  }

  return body["data"] as T;
}

/**
 * Fetch all tasks in a project.
 * Returns name, completed, due_on, and assignee (name only).
 */
export async function getProjectTasks(
  pat: string,
  projectGid: string
): Promise<AsanaTask[]> {
  const params = new URLSearchParams({
    project: projectGid,
    opt_fields: "gid,name,completed,due_on,assignee.name",
    limit: "100",
  });
  return fetchAsana<AsanaTask[]>(`/tasks?${params}`, pat);
}

/**
 * Create a new task in a project.
 */
export async function createProjectTask(
  pat: string,
  projectGid: string,
  name: string,
  dueOn?: string | null
): Promise<AsanaTask> {
  const taskData: Record<string, unknown> = {
    name,
    projects: [projectGid],
  };
  if (dueOn) taskData["due_on"] = dueOn;

  return fetchAsana<AsanaTask>("/tasks", pat, {
    method: "POST",
    body: JSON.stringify({ data: taskData }),
  });
}

/**
 * Update the completed status of a task.
 */
export async function updateTaskStatus(
  pat: string,
  taskGid: string,
  completed: boolean
): Promise<AsanaTask> {
  return fetchAsana<AsanaTask>(`/tasks/${taskGid}`, pat, {
    method: "PUT",
    body: JSON.stringify({ data: { completed } }),
  });
}

/**
 * Validate that a PAT is functional by hitting /users/me.
 * Returns the user's name on success.
 */
export async function validatePat(pat: string): Promise<{ name: string; email: string }> {
  const me = await fetchAsana<{ name: string; email: string }>("/users/me?opt_fields=name,email", pat);
  return me;
}
