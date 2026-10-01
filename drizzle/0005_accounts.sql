CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
