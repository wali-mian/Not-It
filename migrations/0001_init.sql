-- One deployment serves one house, so `house` only ever holds a single row.
CREATE TABLE house (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name           TEXT NOT NULL,
  code_hash      TEXT NOT NULL,
  code_salt      TEXT NOT NULL,
  session_secret TEXT NOT NULL,
  start_week     TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE members (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL UNIQUE
);

-- Weeks are written once. Later roster changes can never rewrite history.
CREATE TABLE assignments (
  week_start   TEXT NOT NULL,
  chore        TEXT NOT NULL CHECK (chore IN ('milk', 'trash', 'broom')),
  scheduled_id INTEGER NOT NULL REFERENCES members (id),
  assignee_id  INTEGER NOT NULL REFERENCES members (id),
  completed_at TEXT,
  completed_by INTEGER REFERENCES members (id),
  late         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, chore)
);

CREATE TABLE login_attempts (
  ip           TEXT PRIMARY KEY,
  failures     INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);
