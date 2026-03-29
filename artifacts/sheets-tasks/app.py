import os
import json
import sqlite3
import threading
import logging
from datetime import datetime, date
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, request, render_template, abort
from apscheduler.schedulers.background import BackgroundScheduler
import gspread
from google.oauth2.service_account import Credentials

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = Flask(__name__)

DB_PATH = os.path.join(os.path.dirname(__file__), "tasks.db")
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

sync_status = {"last_sync": None, "syncing": False, "error": None}
_sync_lock = threading.Lock()


# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                sheet_row   INTEGER,
                task_name   TEXT NOT NULL,
                due_date    TEXT,
                status      TEXT DEFAULT 'Pending',
                client      TEXT,
                notes       TEXT,
                created_at  TEXT DEFAULT (datetime('now')),
                updated_at  TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()


# ── Google Sheets helpers ─────────────────────────────────────────────────────

def get_sheet_client():
    cred_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not cred_json:
        return None, "GOOGLE_SERVICE_ACCOUNT_JSON secret not set"
    try:
        info = json.loads(cred_json)
        creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        gc = gspread.authorize(creds)
        return gc, None
    except Exception as e:
        return None, str(e)


def get_sheet():
    gc, err = get_sheet_client()
    if err:
        return None, err
    sheet_id = os.environ.get("GOOGLE_SHEET_ID", "")
    if not sheet_id:
        return None, "GOOGLE_SHEET_ID env var not set"
    try:
        sh = gc.open_by_key(sheet_id)
        ws = sh.sheet1
        return ws, None
    except Exception as e:
        return None, str(e)


def rows_to_tasks(rows):
    """Convert sheet rows (list of lists) to task dicts.
    Expected columns: Task Name | Due Date | Status | Assigned Client | Notes
    Row index 1 = header, data starts at 2.
    """
    tasks = []
    for i, row in enumerate(rows[1:], start=2):  # skip header
        def cell(idx):
            return row[idx].strip() if idx < len(row) and row[idx] else ""
        tasks.append({
            "sheet_row": i,
            "task_name": cell(0),
            "due_date":  cell(1),
            "status":    cell(2) or "Pending",
            "client":    cell(3),
            "notes":     cell(4),
        })
    return [t for t in tasks if t["task_name"]]


# ── Sync logic ────────────────────────────────────────────────────────────────

def pull_from_sheet():
    """Overwrite local DB with sheet contents."""
    ws, err = get_sheet()
    if err:
        return err
    try:
        rows = ws.get_all_values()
    except Exception as e:
        return str(e)

    sheet_tasks = rows_to_tasks(rows)
    with get_db() as conn:
        conn.execute("DELETE FROM tasks")
        conn.executemany(
            """INSERT INTO tasks (sheet_row, task_name, due_date, status, client, notes)
               VALUES (:sheet_row, :task_name, :due_date, :status, :client, :notes)""",
            sheet_tasks,
        )
        conn.commit()
    return None


def push_task_to_sheet(task_id):
    """Write a single task back to its sheet row."""
    ws, err = get_sheet()
    if err:
        return err
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row:
        return "Task not found"
    if not row["sheet_row"]:
        return "No sheet row linked"
    try:
        sheet_row = int(row["sheet_row"])
        ws.update(f"A{sheet_row}:E{sheet_row}", [[
            row["task_name"],
            row["due_date"] or "",
            row["status"],
            row["client"] or "",
            row["notes"] or "",
        ]])
    except Exception as e:
        return str(e)
    return None


def append_task_to_sheet(task_id):
    """Append a newly created task to the sheet and update its sheet_row."""
    ws, err = get_sheet()
    if err:
        return err
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row:
        return "Task not found"
    try:
        result = ws.append_row([
            row["task_name"],
            row["due_date"] or "",
            row["status"],
            row["client"] or "",
            row["notes"] or "",
        ], value_input_option="USER_ENTERED")
        # Try to figure out the row number that was appended
        updated_range = result.get("updates", {}).get("updatedRange", "")
        if updated_range:
            import re
            m = re.search(r"(\d+)$", updated_range)
            if m:
                sheet_row = int(m.group(1))
                with get_db() as conn:
                    conn.execute("UPDATE tasks SET sheet_row=? WHERE id=?", (sheet_row, task_id))
                    conn.commit()
    except Exception as e:
        return str(e)
    return None


def delete_task_from_sheet(sheet_row):
    """Delete a row from the sheet."""
    ws, err = get_sheet()
    if err:
        return err
    try:
        ws.delete_rows(int(sheet_row))
    except Exception as e:
        return str(e)
    return None


def do_sync():
    with _sync_lock:
        if sync_status["syncing"]:
            return
        sync_status["syncing"] = True
    try:
        err = pull_from_sheet()
        sync_status["error"] = err
        sync_status["last_sync"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    finally:
        sync_status["syncing"] = False


# ── API routes ────────────────────────────────────────────────────────────────

@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    client = request.args.get("client")
    with get_db() as conn:
        if client:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE client=? ORDER BY "
                "CASE WHEN status='Completed' THEN 1 ELSE 0 END, due_date ASC",
                (client,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tasks ORDER BY "
                "CASE WHEN status='Completed' THEN 1 ELSE 0 END, due_date ASC"
            ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(force=True)
    task_name = (data.get("task_name") or "").strip()
    if not task_name:
        return jsonify({"error": "task_name is required"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO tasks (task_name, due_date, status, client, notes)
               VALUES (?,?,?,?,?)""",
            (task_name, data.get("due_date") or None, data.get("status") or "Pending",
             data.get("client") or None, data.get("notes") or None),
        )
        conn.commit()
        task_id = cur.lastrowid
    threading.Thread(target=append_task_to_sheet, args=(task_id,), daemon=True).start()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    data = request.get_json(force=True)
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not existing:
            abort(404)
        conn.execute(
            """UPDATE tasks SET task_name=?, due_date=?, status=?, client=?, notes=?,
               updated_at=datetime('now') WHERE id=?""",
            (
                data.get("task_name", existing["task_name"]),
                data.get("due_date", existing["due_date"]),
                data.get("status", existing["status"]),
                data.get("client", existing["client"]),
                data.get("notes", existing["notes"]),
                task_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    threading.Thread(target=push_task_to_sheet, args=(task_id,), daemon=True).start()
    return jsonify(dict(row))


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not existing:
            abort(404)
        sheet_row = existing["sheet_row"]
        conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        conn.commit()
    if sheet_row:
        threading.Thread(target=delete_task_from_sheet, args=(sheet_row,), daemon=True).start()
    return "", 204


@app.route("/api/sync", methods=["POST"])
def manual_sync():
    threading.Thread(target=do_sync, daemon=True).start()
    return jsonify({"message": "Sync started"})


@app.route("/api/sync/status")
def sync_status_route():
    return jsonify(sync_status)


@app.route("/api/clients")
def list_clients():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT client FROM tasks WHERE client IS NOT NULL AND client != '' ORDER BY client"
        ).fetchall()
    return jsonify([r["client"] for r in rows])


# ── Page routes ───────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/client/<client_name>")
def client_page(client_name):
    return render_template("client.html", client_name=client_name)


# ── Bootstrap ─────────────────────────────────────────────────────────────────

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(do_sync, "interval", hours=1, id="hourly_sync")
    scheduler.start()


if __name__ == "__main__":
    init_db()
    start_scheduler()
    # Do an initial pull if credentials are available
    cred_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if cred_json and sheet_id:
        threading.Thread(target=do_sync, daemon=True).start()
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
