const { DatabaseSync } = require('node:sqlite');
const { DB_PATH } = require('./config');

let dbInstance = null;

function getDb() {
    if (!dbInstance) {
        dbInstance = new DatabaseSync(DB_PATH);
        dbInstance.exec('PRAGMA journal_mode = WAL;');
        dbInstance.exec('PRAGMA foreign_keys = ON;');
        initTables(dbInstance);
    }
    return dbInstance;
}

function initTables(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'member', 'viewer')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sprints (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            goal TEXT NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'completed')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            sprint_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('backlog', 'in_progress', 'review', 'done')),
            priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'critical')),
            points INTEGER NOT NULL DEFAULT 1,
            assignee_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (sprint_id) REFERENCES sprints(id) ON DELETE CASCADE,
            FOREIGN KEY (assignee_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            actor_name TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            action TEXT NOT NULL,
            field_changed TEXT,
            old_value TEXT,
            new_value TEXT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
    `);

    // Seed users and initial sprint if empty
    const checkUsers = db.prepare('SELECT count(*) as count FROM users').get();
    if (checkUsers.count === 0) {
        const uStmt = db.prepare('INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)');
        uStmt.run('usr-1', 'Alex Mercer', 'alex.mercer@enterprise.io', 'admin');
        uStmt.run('usr-2', 'Devon Vance', 'devon.vance@enterprise.io', 'member');
        uStmt.run('usr-3', 'Sara Croft', 'sara.croft@enterprise.io', 'viewer');

        const sStmt = db.prepare('INSERT INTO sprints (id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)');
        sStmt.run('sprint-101', 'Sprint 42: Core Microservices & RBAC', 'Deliver robust token management and zero-defect audit logging pipeline', '2026-11-01', '2026-11-20', 'active');

        const tStmt = db.prepare('INSERT INTO tasks (id, sprint_id, title, description, status, priority, points, assignee_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        tStmt.run('task-1', 'sprint-101', 'Implement OAuth2 Session Revocation Handler', 'Ensure revoked tokens immediately reject API requests via Redis blacklist cache.', 'done', 'critical', 5, 'usr-1');
        tStmt.run('task-2', 'sprint-101', 'Write Granular RBAC Permission Matrix Middleware', 'Enforce admin, member, and viewer role boundaries on all state-mutating HTTP endpoints.', 'review', 'high', 3, 'usr-2');
        tStmt.run('task-3', 'sprint-101', 'Design Burndown Analytics Chart Component', 'Integrate sprint milestone tracking with story point burndown telemetry.', 'in_progress', 'medium', 5, 'usr-2');
        tStmt.run('task-4', 'sprint-101', 'Audit Database Foreign Key Cascade Rules', 'Validate that orphaned task logs and sprints are pruned correctly upon entity removal.', 'backlog', 'low', 2, 'usr-1');

        const aStmt = db.prepare('INSERT INTO audit_logs (id, task_id, actor_name, actor_role, action, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        aStmt.run('aud-1', 'task-1', 'Alex Mercer', 'admin', 'STATUS_CHANGE', 'status', 'in_progress', 'done');
        aStmt.run('aud-2', 'task-2', 'Devon Vance', 'member', 'STATUS_CHANGE', 'status', 'in_progress', 'review');
    }
}

module.exports = { getDb };
