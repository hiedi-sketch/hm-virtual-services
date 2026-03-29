import os
import json
import sqlite3
import threading
import logging
from datetime import datetime, date

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

# Sheet layout constants
HEADER_ROW = 2       # row 2 has headers
DATA_START  = 3      # data starts at row 3

# Column indices (0-based within each row)
COL_CLIENT    = 0
COL_CATEGORY  = 1
COL_FREQUENCY = 2
COL_DAY_SPEC  = 3
COL_TASK_DESC = 4
COL_DUE_DATE  = 5
COL_COMPLETED = 6    # TRUE / FALSE
COL_COMP_DATE = 7
COL_STATUS    = 8    # "Not Started" / "In Progress" / etc.

sync_status = {"last_sync": None, "syncing": False, "error": None}
_sync_lock = threading.Lock()


# ── Date helpers ──────────────────────────────────────────────────────────────

def sheet_date_to_iso(val: str) -> str | None:
    """Convert M/D/YYYY → YYYY-MM-DD. Return None if blank/invalid."""
    val = (val or "").strip()
    if not val:
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def iso_to_sheet_date(val: str) -> str:
    """Convert YYYY-MM-DD → M/D/YYYY."""
    if not val:
        return ""
    try:
        return datetime.strptime(val, "%Y-%m-%d").strftime("%-m/%-d/%Y")
    except ValueError:
        return val


def resolve_status(completed_flag: str, text_status: str) -> str:
    """Map sheet columns → app status string."""
    if (completed_flag or "").strip().upper() == "TRUE":
        return "Completed"
    ts = (text_status or "").strip().lower()
    if ts == "in progress":
        return "In Progress"
    return "Pending"


def status_to_sheet(status: str):
    """Return (completed_bool_str, text_status) for writing back to sheet."""
    if status == "Completed":
        return "TRUE", "Completed"
    if status == "In Progress":
        return "FALSE", "In Progress"
    return "FALSE", "Not Started"


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
                category       TEXT,
                frequency      TEXT,
                day_spec       TEXT,
                due_date       TEXT,
                status         TEXT DEFAULT 'Pending',
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
        # Use 'Bookkeeping Tasks' if present, else first sheet
        titles = [ws.title for ws in sh.worksheets()]
        ws_name = "Bookkeeping Tasks" if "Bookkeeping Tasks" in titles else titles[0]
        return sh.worksheet(ws_name), None
    except Exception as e:
        return None, str(e)


def row_to_task(row: list, sheet_row_num: int) -> dict | None:
    def cell(i):
        return row[i].strip() if i < len(row) else ""

    task_name = cell(COL_TASK_DESC)
    if not task_name:
        return None

    status = resolve_status(cell(COL_COMPLETED), cell(COL_STATUS))
    return {
        "sheet_row":      sheet_row_num,
        "task_name":      task_name,
        "category":       cell(COL_CATEGORY),
        "frequency":      cell(COL_FREQUENCY),
        "day_spec":       cell(COL_DAY_SPEC),
        "due_date":       sheet_date_to_iso(cell(COL_DUE_DATE)),
        "status":         status,
        "completed_date": sheet_date_to_iso(cell(COL_COMP_DATE)),
        "client":         cell(COL_CLIENT),
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
               (sheet_row, task_name, category, frequency, day_spec,
                due_date, status, completed_date, client)
               VALUES (:sheet_row,:task_name,:category,:frequency,:day_spec,
                       :due_date,:status,:completed_date,:client)""",
            tasks,
        )
        conn.commit()
    return None


def push_task_to_sheet(task_id):
    ws, err = get_sheet()
    if err:
        return err
    with get_db() as conn:
        row = conn.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not row or not row["sheet_row"]:
        return "No sheet row linked"
    comp_bool, text_status = status_to_sheet(row["status"])
    comp_date = iso_to_sheet_date(row["completed_date"]) if row["completed_date"] else (
        datetime.now().strftime("%-m/%-d/%Y") if row["status"] == "Completed" else ""
    )
    try:
        sheet_row = int(row["sheet_row"])
        ws.update(f"A{sheet_row}:I{sheet_row}", [[
            row["client"] or "",
            row["category"] or "",
            row["frequency"] or "",
            row["day_spec"] or "",
            row["task_name"],
            iso_to_sheet_date(row["due_date"]) if row["due_date"] else "",
            comp_bool,
            comp_date,
            text_status,
        ]])
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
    comp_bool, text_status = status_to_sheet(row["status"])
    try:
        result = ws.append_row([
            row["client"] or "",
            row["category"] or "",
            row["frequency"] or "",
            row["day_spec"] or "",
            row["task_name"],
            iso_to_sheet_date(row["due_date"]) if row["due_date"] else "",
            comp_bool,
            "",
            text_status,
        ], value_input_option="USER_ENTERED")
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
    category = request.args.get("category")
    with get_db() as conn:
        q = "SELECT * FROM tasks WHERE 1=1"
        params = []
        if client:
            q += " AND client=?"; params.append(client)
        if category:
            q += " AND category=?"; params.append(category)
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
            """INSERT INTO tasks (task_name, category, frequency, day_spec,
               due_date, status, client)
               VALUES (?,?,?,?,?,?,?)""",
            (task_name, data.get("category") or None, data.get("frequency") or None,
             data.get("day_spec") or None, data.get("due_date") or None,
             data.get("status") or "Pending", data.get("client") or None),
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
        new_status = data.get("status", ex["status"])
        comp_date = ex["completed_date"]
        if new_status == "Completed" and not comp_date:
            comp_date = date.today().isoformat()
        elif new_status != "Completed":
            comp_date = None
        conn.execute(
            """UPDATE tasks SET task_name=?,category=?,frequency=?,day_spec=?,
               due_date=?,status=?,completed_date=?,client=?,updated_at=datetime('now')
               WHERE id=?""",
            (
                data.get("task_name", ex["task_name"]),
                data.get("category", ex["category"]),
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
    threading.Thread(target=push_task_to_sheet, args=(task_id,), daemon=True).start()
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


@app.route("/api/categories")
def list_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT category FROM tasks WHERE category IS NOT NULL AND category!='' ORDER BY category"
        ).fetchall()
    return jsonify([r["category"] for r in rows])


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
