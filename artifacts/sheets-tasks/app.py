import os
import json
import sqlite3
import threading
import logging
import time
from datetime import datetime, date

import requests as http_requests
from flask import Flask, jsonify, request, render_template, abort
from apscheduler.schedulers.background import BackgroundScheduler
import gspread
from google.oauth2.service_account import Credentials

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ── Completion webhook ─────────────────────────────────────────────────────────

WEBHOOK_URL = (
    "https://script.google.com/macros/s/"
    "AKfycbypfsBkNWTnNoUhLy_nDahx6je7kPNatXbCRv0Qujyd2AfRyfk7EB-29EbZrb7DX31lKw"
    "/exec?token=mySecret123"
)

def trigger_completion_webhook(task_id: int, task_name: str) -> None:
    """POST to the Google Apps Script webhook (up to 3 attempts)."""
    payload = {"task_id": task_id, "task_name": task_name}
    for attempt in range(1, 4):
        try:
            resp = http_requests.post(WEBHOOK_URL, json=payload, timeout=15)
            log.info(
                "Completion webhook triggered for task %s (%r): HTTP %s",
                task_id, task_name, resp.status_code,
            )
            return
        except Exception as exc:
            log.warning(
                "Completion webhook attempt %d/%d failed for task %s: %s",
                attempt, 3, task_id, exc,
            )
            if attempt < 3:
                time.sleep(2 ** (attempt - 1))
    log.error("Completion webhook failed after 3 attempts for task %s", task_id)

app = Flask(__name__)

# ── Path-prefix middleware (for reverse-proxy with base path) ──────────────────

BASE_PATH = os.environ.get("BASE_PATH", "/").rstrip("/")

class PrefixMiddleware:
    """Strip a URL prefix so Flask sees root-relative paths."""
    def __init__(self, wsgi_app, prefix):
        self.app = wsgi_app
        self.prefix = prefix

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        if path.startswith(self.prefix + "/") or path == self.prefix:
            environ["PATH_INFO"] = path[len(self.prefix):] or "/"
            environ["SCRIPT_NAME"] = environ.get("SCRIPT_NAME", "") + self.prefix
        return self.app(environ, start_response)

if BASE_PATH and BASE_PATH != "/":
    app.wsgi_app = PrefixMiddleware(app.wsgi_app, BASE_PATH)

@app.context_processor
def inject_base_path():
    bp = (BASE_PATH or "").rstrip("/") + "/"
    if bp == "/":
        bp = "/"
    return {"base_path": bp}

DB_PATH = os.path.join(os.path.dirname(__file__), "tasks.db")
SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]

# ── Actual sheet layout (as of latest sync) ───────────────────────────────────
# Row 1: all blank
# Row 2: headers
# Row 3+: data
HEADER_ROW = 2
DATA_START  = 3

# Column indices (0-based)
COL_STATUS    = 0   # Text status: "Not Started" / "In Progress" / "Completed"
COL_CLIENT    = 1   # Client name
COL_SERVICE   = 2   # Service Type: "Bookkeeping" / "Virtual Assistant"
COL_FREQUENCY = 3   # Frequency: Daily / Weekly / Monthly
COL_DAY_SPEC  = 4   # Day detail: "Tuesday", "Friday", etc.
COL_TASK_DESC = 5   # Task Description
COL_DUE_DATE  = 6   # Due Date M/D/YYYY
COL_COMP_DATE = 7   # Completed Date M/D/YYYY

sync_status = {"last_sync": None, "syncing": False, "error": None}
_sync_lock = threading.Lock()


# ── Date helpers ──────────────────────────────────────────────────────────────

def sheet_date_to_iso(val: str) -> str | None:
    val = (val or "").strip()
    if not val:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def iso_to_sheet_date(val: str) -> str:
    if not val:
        return ""
    try:
        return datetime.strptime(val, "%Y-%m-%d").strftime("%-m/%-d/%Y")
    except ValueError:
        return val


def resolve_status(text_status: str) -> str:
    ts = (text_status or "").strip()
    if ts == "Completed":
        return "Completed"
    if ts == "In Progress":
        return "In Progress"
    if ts == "Not Started":
        return "Not Started"
    return "Not Started"


def status_to_sheet_text(status: str) -> str:
    mapping = {
        "Not Started": "Not Started",
        "Pending":     "Not Started",
        "In Progress": "In Progress",
        "Completed":   "Completed",
    }
    return mapping.get(status, "Not Started")


# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                sheet_row      INTEGER,
                task_name      TEXT NOT NULL,
                service_type   TEXT,
                frequency      TEXT,
                day_spec       TEXT,
                due_date       TEXT,
                status         TEXT DEFAULT 'Not Started',
                completed_date TEXT,
                client         TEXT,
                created_at     TEXT DEFAULT (datetime('now')),
                updated_at     TEXT DEFAULT (datetime('now'))
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
        titles = [ws.title for ws in sh.worksheets()]
        ws_name = "Bookkeeping Tasks" if "Bookkeeping Tasks" in titles else titles[0]
        return sh.worksheet(ws_name), None
    except Exception as e:
        return None, str(e)


def cell(row: list, idx: int) -> str:
    return row[idx].strip() if idx < len(row) else ""


def row_to_task(row: list, sheet_row_num: int) -> dict | None:
    task_name = cell(row, COL_TASK_DESC)
    if not task_name:
        return None
    return {
        "sheet_row":      sheet_row_num,
        "task_name":      task_name,
        "service_type":   cell(row, COL_SERVICE) or None,
        "frequency":      cell(row, COL_FREQUENCY) or None,
        "day_spec":       cell(row, COL_DAY_SPEC) or None,
        "due_date":       sheet_date_to_iso(cell(row, COL_DUE_DATE)),
        "status":         resolve_status(cell(row, COL_STATUS)),
        "completed_date": sheet_date_to_iso(cell(row, COL_COMP_DATE)),
        "client":         cell(row, COL_CLIENT) or None,
    }


# ── Sync logic ────────────────────────────────────────────────────────────────

def pull_from_sheet():
    ws, err = get_sheet()
    if err:
        return err
    try:
        all_rows = ws.get_all_values()
    except Exception as e:
        return str(e)

    tasks = []
    for idx, row in enumerate(all_rows):
        actual_row_num = idx + 1
        if actual_row_num < DATA_START:
            continue
        t = row_to_task(row, actual_row_num)
        if t:
            tasks.append(t)

    with get_db() as conn:
        conn.execute("DELETE FROM tasks")
        conn.executemany(
            """INSERT INTO tasks
               (sheet_row, task_name, service_type, frequency, day_spec,
                due_date, status, completed_date, client)
               VALUES (:sheet_row,:task_name,:service_type,:frequency,:day_spec,
                       :due_date,:status,:completed_date,:client)""",
            tasks,
        )
        conn.commit()
    return None


def build_sheet_row(task) -> list:
    """Build the 8-column list to write back to the sheet."""
    comp_date = ""
    if task["status"] == "Completed" and task.get("completed_date"):
        comp_date = iso_to_sheet_date(task["completed_date"])
    elif task["status"] == "Completed":
        comp_date = datetime.now().strftime("%-m/%-d/%Y")
    return [
        status_to_sheet_text(task["status"]),    # A: Text status
        task["client"] or "",                     # B: Client
        task["service_type"] or "",               # C: Service Type
        task["frequency"] or "",                  # D: Frequency
        task["day_spec"] or "",                   # E: Day Spec
        task["task_name"],                        # F: Task Description
        iso_to_sheet_date(task["due_date"]) if task["due_date"] else "",  # G: Due Date
        comp_date,                                # H: Completed Date
    ]


def push_task_to_sheet(task_id):
    ws, err = get_sheet()
    if err:
        return err
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row or not row["sheet_row"]:
        return "No sheet row linked"
    try:
        sheet_row = int(row["sheet_row"])
        ws.update(f"A{sheet_row}:H{sheet_row}", [build_sheet_row(dict(row))])
    except Exception as e:
        return str(e)
    return None


def append_task_to_sheet(task_id):
    ws, err = get_sheet()
    if err:
        return err
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row:
        return "Task not found"
    try:
        result = ws.append_row(build_sheet_row(dict(row)), value_input_option="USER_ENTERED")
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
    service_type = request.args.get("service_type")
    with get_db() as conn:
        q = "SELECT * FROM tasks WHERE 1=1"
        params = []
        if client:
            q += " AND client=?"; params.append(client)
        if service_type:
            q += " AND service_type=?"; params.append(service_type)
        q += " ORDER BY CASE WHEN status='Completed' THEN 1 ELSE 0 END, due_date ASC NULLS LAST"
        rows = conn.execute(q, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/tasks", methods=["POST"])
def create_task():
    data = request.get_json(force=True)
    task_name = (data.get("task_name") or "").strip()
    if not task_name:
        return jsonify({"error": "task_name is required"}), 400
    with get_db() as conn:
        cur = conn.execute(
            """INSERT INTO tasks (task_name, service_type, frequency, day_spec,
               due_date, status, client)
               VALUES (?,?,?,?,?,?,?)""",
            (task_name, data.get("service_type") or None, data.get("frequency") or None,
             data.get("day_spec") or None, data.get("due_date") or None,
             data.get("status") or "Not Started", data.get("client") or None),
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
        ex = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not ex:
            abort(404)
        prev_status = ex["status"]
        new_status = data.get("status", prev_status)
        comp_date = ex["completed_date"]
        if new_status == "Completed" and not comp_date:
            comp_date = date.today().isoformat()
        elif new_status != "Completed":
            comp_date = None
        new_task_name = data.get("task_name", ex["task_name"])
        conn.execute(
            """UPDATE tasks SET task_name=?,service_type=?,frequency=?,day_spec=?,
               due_date=?,status=?,completed_date=?,client=?,updated_at=datetime('now')
               WHERE id=?""",
            (
                new_task_name,
                data.get("service_type", ex["service_type"]),
                data.get("frequency", ex["frequency"]),
                data.get("day_spec", ex["day_spec"]),
                data.get("due_date", ex["due_date"]),
                new_status,
                comp_date,
                data.get("client", ex["client"]),
                task_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        just_completed = prev_status != "Completed" and new_status == "Completed"

    threading.Thread(target=push_task_to_sheet, args=(task_id,), daemon=True).start()

    if just_completed:
        threading.Thread(
            target=trigger_completion_webhook,
            args=(task_id, new_task_name),
            daemon=True,
        ).start()

    return jsonify(dict(row))


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    with get_db() as conn:
        ex = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        if not ex:
            abort(404)
        sheet_row = ex["sheet_row"]
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
            "SELECT DISTINCT client FROM tasks WHERE client IS NOT NULL AND client!='' ORDER BY client"
        ).fetchall()
    return jsonify([r["client"] for r in rows])


@app.route("/api/service_types")
def list_service_types():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT service_type FROM tasks WHERE service_type IS NOT NULL AND service_type!='' ORDER BY service_type"
        ).fetchall()
    return jsonify([r["service_type"] for r in rows])


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
    cred_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if cred_json and sheet_id:
        threading.Thread(target=do_sync, daemon=True).start()
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
