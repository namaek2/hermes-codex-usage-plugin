"""Bounded, fail-open collection of API request usage; never stores message bodies."""
import math
import sqlite3
import threading
import time

MAX_INT = 1_000_000_000
MAX_ID = 256
LABEL_CHARS = 128
COMPONENTS = ("input_tokens", "cache_read_tokens", "cache_write_tokens", "output_tokens")


def _id(value):
    return value if isinstance(value, str) and 0 < len(value) <= MAX_ID and not any(ord(c) < 32 or ord(c) == 127 for c in value) else None


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, int):
        return value if 0 <= value <= MAX_INT else None
    if not math.isfinite(value) or value < 0 or value > MAX_INT or not value.is_integer():
        return None
    return int(value)


def _timestamp(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, int):
        return float(value) if 0 <= value <= 4_102_444_800 else None
    return value if math.isfinite(value) and 0 <= value <= 4_102_444_800 else None


def _label(value):
    return value if isinstance(value, str) and 0 < len(value) <= LABEL_CHARS and all(c.isalnum() or c in "._:/+-" for c in value) else None


class UsageCollector:
    def __init__(self, ctx, owner_dir):
        self.ctx, self.owner_dir = ctx, owner_dir
        self.lock = threading.RLock()
        self.dropped_events = 0
        self.storage_failures = 0
        self.diagnostic_lock = threading.Lock()
        self.started = time.time()
        self._write(lambda db: db.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('collection_started_at',?)", (str(self.started),)))

    def _connect(self):
        from hermes_constants import get_hermes_home
        from plugins.plugin_storage import plugin_db
        if (get_hermes_home() / "plugin-data" / "limits-monitor").resolve() != self.owner_dir:
            raise PermissionError("profile storage mismatch")
        db = plugin_db("limits-monitor", "usage.db")
        db.execute("PRAGMA busy_timeout=3000")
        db.executescript("""
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS requests(request_id TEXT PRIMARY KEY, session_id TEXT, task_id TEXT, turn_id TEXT,
            conversation_id TEXT, parent_session_id TEXT, child_session_id TEXT, provider TEXT, model TEXT,
            started_at REAL, observed_at REAL NOT NULL, state TEXT NOT NULL, status_code INTEGER,
            input_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, output_tokens INTEGER,
            prompt_tokens INTEGER, reported_total_tokens INTEGER);
          CREATE TABLE IF NOT EXISTS relationships(kind TEXT NOT NULL,parent TEXT NOT NULL,child TEXT NOT NULL,
            UNIQUE(kind,parent,child));
        """)
        return db

    def _write(self, fn):
        try:
            with self.lock:
                db = self._connect()
                try:
                    db.execute("BEGIN IMMEDIATE"); fn(db); db.commit()
                except Exception:
                    db.rollback(); raise
                finally: db.close()
        except Exception:
            with self.diagnostic_lock: self.storage_failures = min(MAX_INT, self.storage_failures + 1)
            return None

    def _event(self, state, kw):
        try:
            rid = _id(kw.get("api_request_id"))
            if not rid:
                with self.diagnostic_lock: self.dropped_events = min(MAX_INT, self.dropped_events + 1)
                return
            sid, task, turn = (_id(kw.get(k)) for k in ("session_id", "task_id", "turn_id"))
            conv = _id(kw.get("conversation_id")); start = _timestamp(kw.get("started_at"))
            observed = time.time(); provider, model = _label(kw.get("provider")), _label(kw.get("model"))
            status = _number(kw.get("status_code")); usage = kw.get("usage") if isinstance(kw.get("usage"), dict) else {}
            vals = {k: _number(usage.get(k)) for k in COMPONENTS}
            def save(db):
                old = db.execute("SELECT state,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens FROM requests WHERE request_id=?", (rid,)).fetchone()
                if old and old[0] in ("success", "error") and state == "pending": return
                merged = [((old[i+1] if old else None) if vals[k] is None else vals[k]) for i,k in enumerate(COMPONENTS)]
                # Conflicting repeated known values cannot rewrite established facts.
                if old:
                    merged = [old[i+1] if old[i+1] is not None else vals[k] for i,k in enumerate(COMPONENTS)]
                prompt = sum(merged[:3]) if all(x is not None for x in merged[:3]) else None
                total = prompt + merged[3] if prompt is not None and merged[3] is not None else None
                fields=(sid,task,turn,conv,provider,model,start,observed,state,status,*merged,prompt,total)
                if old:
                    db.execute("""UPDATE requests SET session_id=COALESCE(session_id,?),task_id=COALESCE(task_id,?),turn_id=COALESCE(turn_id,?),
                     conversation_id=COALESCE(conversation_id,?),provider=COALESCE(provider,?),model=COALESCE(model,?),started_at=COALESCE(started_at,?),
                     observed_at=MAX(observed_at,?),state=CASE WHEN state IN ('success','error') THEN state ELSE ? END,status_code=COALESCE(status_code,?),
                     input_tokens=?,cache_read_tokens=?,cache_write_tokens=?,output_tokens=?,prompt_tokens=?,reported_total_tokens=? WHERE request_id=?""", (*fields,rid))
                else:
                    db.execute("""INSERT INTO requests(session_id,task_id,turn_id,conversation_id,provider,model,started_at,observed_at,state,status_code,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,prompt_tokens,reported_total_tokens,request_id)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (*fields,rid))
            self._write(save)
        except Exception:
            with self.diagnostic_lock: self.dropped_events = min(MAX_INT, self.dropped_events + 1)

    def pre_api_request(self, **kwargs): self._event("pending", kwargs)
    def post_api_request(self, **kwargs): self._event("success", kwargs)
    def api_request_error(self, **kwargs): self._event("error", kwargs)

    def _relationship(self, kind, parent, child):
        parent, child = _id(parent), _id(child)
        if not parent or not child or parent == child: return
        self._write(lambda db: db.execute("INSERT OR IGNORE INTO relationships(kind,parent,child) VALUES(?,?,?)", (kind,parent,child)))

    def subagent_start(self, **kwargs):
        self._relationship("subagent", kwargs.get("parent_session_id"), kwargs.get("child_session_id"))

    def on_session_reset(self, **kwargs):
        self._relationship("reset", kwargs.get("old_session_id") or kwargs.get("session_id"), kwargs.get("new_session_id"))

    def list_usage(self, params=None, *, session_id=None, **kwargs):
        if not isinstance(params, dict): raise ValueError("params must be an object")
        allowed={"limit","offset","session_id","conversation_id"}
        if set(params)-allowed or kwargs: raise ValueError("unsupported usage.list parameter")
        filt=session_id if session_id is not None else params.get("session_id")
        conv=params.get("conversation_id")
        if filt is not None and _id(filt) is None: raise ValueError("invalid session_id")
        if conv is not None and _id(conv) is None: raise ValueError("invalid conversation_id")
        limit,offset=params.get("limit",25),params.get("offset",0)
        if type(limit) is not int or not 1<=limit<=100 or type(offset) is not int or not 0<=offset<=10000: raise ValueError("invalid bounds")
        db=self._connect()
        try:
            started=db.execute("SELECT value FROM meta WHERE key='collection_started_at'").fetchone()
            where,args=(" WHERE conversation_id=?",[conv]) if conv else ((" WHERE session_id=?",[filt]) if filt else ("",[]))
            # Conversation rows explicitly collapse segments; session IDs remain visible for auditability.
            rows=db.execute(f"""SELECT COALESCE(conversation_id,session_id),COUNT(*),SUM(state='success'),SUM(state='error'),SUM(reported_total_tokens IS NULL),SUM(reported_total_tokens),SUM(state='pending'),SUM(reported_total_tokens IS NOT NULL),SUM(prompt_tokens),SUM(output_tokens),MIN(started_at),MAX(observed_at),GROUP_CONCAT(DISTINCT provider),GROUP_CONCAT(DISTINCT model),MIN(conversation_id)
                FROM requests{where} GROUP BY COALESCE(conversation_id,session_id) ORDER BY MAX(observed_at) DESC LIMIT ? OFFSET ?""",(*args,limit,offset)).fetchall()
            segments={r[0]:[x[0] for x in db.execute("SELECT DISTINCT session_id FROM requests WHERE COALESCE(conversation_id,session_id)=? LIMIT 100",(r[0],)).fetchall()] for r in rows}
            last=db.execute("SELECT MAX(observed_at) FROM requests").fetchone()[0]
            links=db.execute("SELECT kind,parent,child FROM relationships ORDER BY kind,parent,child LIMIT 100").fetchall()
        finally: db.close()
        result=[]
        for r in rows:
            result.append(dict(conversation_id=r[14],session_id=r[0],segment_session_ids=segments.get(r[0],[]),calls=r[1],successful=r[2] or 0,failed=r[3] or 0,usage_unreported=r[4] or 0,reported_total_tokens=r[5],pending=r[6] or 0,reported_calls=r[7] or 0,known_prompt_tokens=r[8],known_output_tokens=r[9],first_started_at=r[10],last_observed_at=r[11],providers=(r[12] or "").split(",")[:20],models=(r[13] or "").split(",")[:20]))
        with self.diagnostic_lock: diagnostics={"dropped_events":self.dropped_events,"storage_failures":self.storage_failures}
        return dict(rows=result,relationships=[dict(kind=x[0],parent_session_id=x[1],child_session_id=x[2]) for x in links],diagnostics=diagnostics,collection_started_at=float(started[0]) if started else None,last_observed_at=last,read_at=time.time(),coverage=["Observation intervals are local collection times, not provider timestamps.","Explicit conversation_id joins segments; subagent/reset links never merge or add child usage."],quota_status="unmeasured",quota_reason="Account quota and allocation are not measured by conversation-token collection.")
