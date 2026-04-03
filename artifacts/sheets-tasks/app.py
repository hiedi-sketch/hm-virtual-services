import os
import json
import sqlite3
import datetime
from flask import Flask, jsonify, request, render_template, g

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DB_PATH   = os.path.join(BASE_DIR, 'tasks.db')
PORT      = int(os.environ.get('PORT', 5000))
BASE_PATH = '/sheets-tasks/'

app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'))

# ── Database ──────────────────────────────────────────────────────────

def get_db():
    if 'db' not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db

@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop('db', None)
    if db:
        db.close()

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
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
                updated_at     TEXT DEFAULT (datetime('now')),
                assigned       TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS subtasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id     INTEGER NOT NULL,
                description TEXT    NOT NULL,
                completed   INTEGER DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.commit()

# ── Google Sheets sync ────────────────────────────────────────────────

_sync_status = {'state': 'idle', 'last': None, 'error': None}

SHEET_HEADERS = [
    'id', 'task_name', 'client', 'service_type', 'frequency',
    'day_spec', 'due_date', 'status', 'completed_date', 'assigned',
]

def get_worksheet():
    try:
        import gspread
        from google.oauth2.service_account import Credentials
        creds_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
        sheet_id   = os.environ.get('GOOGLE_SHEET_ID', '')
        if not creds_json or not sheet_id:
            return None
        info   = json.loads(creds_json)
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive',
        ]
        creds = Credentials.from_service_account_info(info, scopes=scopes)
        gc    = gspread.authorize(creds)
        return gc.open_by_key(sheet_id).sheet1
    except Exception as exc:
        _sync_status['error'] = str(exc)
        return None

def do_sync():
    global _sync_status
    _sync_status['state'] = 'syncing'
    try:
        ws = get_worksheet()
        if ws is None:
            _sync_status.update({'state': 'offline', 'error': 'Google Sheets not configured'})
            return
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute('SELECT * FROM tasks ORDER BY id').fetchall()
        data = [SHEET_HEADERS]
        for r in rows:
            data.append([r[h] if h in r.keys() else '' for h in SHEET_HEADERS])
        ws.clear()
        ws.update('A1', data)
        _sync_status.update({
            'state': 'ok',
            'last':  datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            'error': None,
        })
    except Exception as exc:
        _sync_status.update({'state': 'error', 'error': str(exc)})

# ── Page routes ───────────────────────────────────────────────────────

@app.route('/')
@app.route('/sheets-tasks')
@app.route('/sheets-tasks/')
def index():
    return render_template('index.html', base_path=BASE_PATH, sync_status=_sync_status)

@app.route('/clients/<path:client_name>')
@app.route('/sheets-tasks/clients/<path:client_name>')
def client_view(client_name):
    return render_template('client.html', client_name=client_name, base_path=BASE_PATH)

# ── API: tasks ────────────────────────────────────────────────────────

@app.route('/api/tasks',               methods=['GET'])
@app.route('/sheets-tasks/api/tasks',  methods=['GET'])
def api_get_tasks():
    db     = get_db()
    client = request.args.get('client')
    if client:
        rows = db.execute('SELECT * FROM tasks WHERE client=? ORDER BY id', (client,)).fetchall()
    else:
        rows = db.execute('SELECT * FROM tasks ORDER BY id').fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tasks',               methods=['POST'])
@app.route('/sheets-tasks/api/tasks',  methods=['POST'])
def api_create_task():
    db   = get_db()
    data = request.get_json(silent=True) or {}
    cur  = db.execute(
        """INSERT INTO tasks (task_name, client, service_type, frequency, day_spec,
                              due_date, status, assigned)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            data.get('task_name', 'Untitled'),
            data.get('client'),
            data.get('service_type'),
            data.get('frequency'),
            data.get('day_spec'),
            data.get('due_date'),
            data.get('status', 'Not Started'),
            data.get('assigned'),
        ),
    )
    db.commit()
    row = db.execute('SELECT * FROM tasks WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201

@app.route('/api/tasks/<int:tid>',              methods=['PUT'])
@app.route('/sheets-tasks/api/tasks/<int:tid>', methods=['PUT'])
def api_update_task(tid):
    db      = get_db()
    data    = request.get_json(silent=True) or {}
    allowed = {
        'task_name', 'client', 'service_type', 'frequency', 'day_spec',
        'due_date', 'status', 'assigned', 'completed_date',
    }
    updates = {k: v for k, v in data.items() if k in allowed}
    if updates.get('status') == 'Completed' and 'completed_date' not in updates:
        updates['completed_date'] = datetime.date.today().isoformat()
    updates['updated_at'] = datetime.datetime.now().isoformat()
    if updates:
        sets = ', '.join(f'{k}=?' for k in updates)
        db.execute(f'UPDATE tasks SET {sets} WHERE id=?', list(updates.values()) + [tid])
        db.commit()
    row = db.execute('SELECT * FROM tasks WHERE id=?', (tid,)).fetchone()
    return jsonify(dict(row))

@app.route('/api/tasks/<int:tid>',              methods=['DELETE'])
@app.route('/sheets-tasks/api/tasks/<int:tid>', methods=['DELETE'])
def api_delete_task(tid):
    db = get_db()
    db.execute('DELETE FROM subtasks WHERE task_id=?', (tid,))
    db.execute('DELETE FROM tasks WHERE id=?', (tid,))
    db.commit()
    return '', 204

# ── API: subtasks ─────────────────────────────────────────────────────

@app.route('/api/tasks/<int:tid>/subtasks',              methods=['GET'])
@app.route('/sheets-tasks/api/tasks/<int:tid>/subtasks', methods=['GET'])
def api_get_subtasks(tid):
    db   = get_db()
    rows = db.execute('SELECT * FROM subtasks WHERE task_id=? ORDER BY id', (tid,)).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/tasks/<int:tid>/subtasks',              methods=['POST'])
@app.route('/sheets-tasks/api/tasks/<int:tid>/subtasks', methods=['POST'])
def api_create_subtask(tid):
    db   = get_db()
    data = request.get_json(silent=True) or {}
    cur  = db.execute(
        'INSERT INTO subtasks (task_id, description) VALUES (?,?)',
        (tid, data.get('description', '')),
    )
    db.commit()
    row = db.execute('SELECT * FROM subtasks WHERE id=?', (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201

@app.route('/api/subtasks/<int:sid>',              methods=['PUT'])
@app.route('/sheets-tasks/api/subtasks/<int:sid>', methods=['PUT'])
def api_update_subtask(sid):
    db   = get_db()
    data = request.get_json(silent=True) or {}
    db.execute('UPDATE subtasks SET completed=? WHERE id=?',
               (1 if data.get('completed') else 0, sid))
    db.commit()
    row = db.execute('SELECT * FROM subtasks WHERE id=?', (sid,)).fetchone()
    return jsonify(dict(row))

@app.route('/api/subtasks/<int:sid>',              methods=['DELETE'])
@app.route('/sheets-tasks/api/subtasks/<int:sid>', methods=['DELETE'])
def api_delete_subtask(sid):
    db = get_db()
    db.execute('DELETE FROM subtasks WHERE id=?', (sid,))
    db.commit()
    return '', 204

# ── API: clients / assignees ──────────────────────────────────────────

@app.route('/api/clients',              methods=['GET'])
@app.route('/sheets-tasks/api/clients', methods=['GET'])
def api_clients():
    db   = get_db()
    rows = db.execute(
        "SELECT DISTINCT client FROM tasks WHERE client IS NOT NULL AND client != '' ORDER BY client"
    ).fetchall()
    return jsonify([r[0] for r in rows])

@app.route('/api/assignees',              methods=['GET'])
@app.route('/sheets-tasks/api/assignees', methods=['GET'])
def api_assignees():
    db   = get_db()
    rows = db.execute(
        "SELECT DISTINCT assigned FROM tasks WHERE assigned IS NOT NULL AND assigned != '' ORDER BY assigned"
    ).fetchall()
    return jsonify([r[0] for r in rows])

# ── API: sync ─────────────────────────────────────────────────────────

@app.route('/api/sync',              methods=['GET'])
@app.route('/sheets-tasks/api/sync', methods=['GET'])
def api_sync_status():
    return jsonify(_sync_status)

@app.route('/api/sync',              methods=['POST'])
@app.route('/sheets-tasks/api/sync', methods=['POST'])
def api_manual_sync():
    do_sync()
    return jsonify(_sync_status)

# ── Startup ───────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(do_sync, 'interval', minutes=5)
        scheduler.start()
    except Exception:
        pass
    app.run(host='0.0.0.0', port=PORT, debug=False)
