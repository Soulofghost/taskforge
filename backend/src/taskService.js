const crypto = require('node:crypto');
const { getDb } = require('./db');
const { enforcePermission } = require('./rbac');

class TaskService {
    constructor() {
        this.db = getDb();
    }

    getUsers() {
        return this.db.prepare('SELECT id, name, email, role FROM users').all();
    }

    getSprints() {
        return this.db.prepare('SELECT * FROM sprints ORDER BY created_at DESC').all();
    }

    getActiveSprintMetrics(sprintId) {
        const sprint = this.db.prepare('SELECT * FROM sprints WHERE id = ?').get(sprintId);
        if (!sprint) return null;

        const tasks = this.db.prepare('SELECT status, points FROM tasks WHERE sprint_id = ?').all(sprintId);
        const totalPoints = tasks.reduce((sum, t) => sum + (t.points || 0), 0);
        const completedPoints = tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.points || 0), 0);
        const inProgressPoints = tasks.filter(t => t.status === 'in_progress' || t.status === 'review').reduce((sum, t) => sum + (t.points || 0), 0);
        const backlogPoints = tasks.filter(t => t.status === 'backlog').reduce((sum, t) => sum + (t.points || 0), 0);

        return {
            sprint,
            totalPoints,
            completedPoints,
            inProgressPoints,
            backlogPoints,
            progressPct: totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0,
            taskCount: tasks.length
        };
    }

    getTasks(sprintId = null) {
        let query = `
            SELECT t.*, u.name as assignee_name, u.role as assignee_role
            FROM tasks t
            LEFT JOIN users u ON t.assignee_id = u.id
        `;
        const params = [];
        if (sprintId) {
            query += ' WHERE t.sprint_id = ?';
            params.push(sprintId);
        }
        query += ' ORDER BY t.created_at ASC';
        return this.db.prepare(query).all(...params);
    }

    getTaskById(taskId) {
        const task = this.db.prepare(`
            SELECT t.*, u.name as assignee_name, u.role as assignee_role
            FROM tasks t
            LEFT JOIN users u ON t.assignee_id = u.id
            WHERE t.id = ?
        `).get(taskId);
        if (!task) return null;

        const auditLogs = this.db.prepare('SELECT * FROM audit_logs WHERE task_id = ? ORDER BY rowid DESC').all(taskId);
        return {
            ...task,
            auditLogs
        };
    }

    createTask({ sprint_id, title, description, priority, points, assignee_id }, actor) {
        enforcePermission(actor.role, 'task:create');

        const taskId = 'task-' + crypto.randomBytes(4).toString('hex');
        const insertStmt = this.db.prepare(`
            INSERT INTO tasks (id, sprint_id, title, description, status, priority, points, assignee_id)
            VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?)
        `);
        insertStmt.run(taskId, sprint_id, title, description, priority || 'medium', points || 1, assignee_id || null);

        // Record Audit Log
        this._recordAudit(taskId, actor, 'CREATE_TASK', null, null, 'backlog');
        return this.getTaskById(taskId);
    }

    updateTaskStatus(taskId, newStatus, actor) {
        enforcePermission(actor.role, 'task:status');

        const validStatuses = ['backlog', 'in_progress', 'review', 'done'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}`);
        }

        const current = this.db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskId);
        if (!current) throw new Error('Task not found');

        if (current.status !== newStatus) {
            this.db.prepare(`UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, taskId);
            this._recordAudit(taskId, actor, 'STATUS_CHANGE', 'status', current.status, newStatus);
        }

        return this.getTaskById(taskId);
    }

    updateTask(taskId, { title, description, priority, points, assignee_id }, actor) {
        enforcePermission(actor.role, 'task:update');

        const current = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!current) throw new Error('Task not found');

        const newTitle = title !== undefined ? title : current.title;
        const newDesc = description !== undefined ? description : current.description;
        const newPriority = priority !== undefined ? priority : current.priority;
        const newPoints = points !== undefined ? points : current.points;
        const newAssignee = assignee_id !== undefined ? assignee_id : current.assignee_id;

        this.db.prepare(`
            UPDATE tasks
            SET title = ?, description = ?, priority = ?, points = ?, assignee_id = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(newTitle, newDesc, newPriority, newPoints, newAssignee, taskId);

        if (current.assignee_id !== newAssignee) {
            this._recordAudit(taskId, actor, 'REASSIGN_TASK', 'assignee_id', current.assignee_id || 'unassigned', newAssignee || 'unassigned');
        }
        if (current.priority !== newPriority) {
            this._recordAudit(taskId, actor, 'PRIORITY_CHANGE', 'priority', current.priority, newPriority);
        }

        return this.getTaskById(taskId);
    }

    deleteTask(taskId, actor) {
        enforcePermission(actor.role, 'task:delete');

        const current = this.db.prepare('SELECT id FROM tasks WHERE id = ?').get(taskId);
        if (!current) throw new Error('Task not found');

        this.db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
        return { status: 'deleted', taskId };
    }

    getAuditLogs(limit = 50) {
        return this.db.prepare(`
            SELECT a.*, t.title as task_title
            FROM audit_logs a
            JOIN tasks t ON a.task_id = t.id
            ORDER BY a.rowid DESC
            LIMIT ?
        `).all(limit);
    }

    _recordAudit(taskId, actor, action, fieldChanged, oldValue, newValue) {
        const auditId = 'aud-' + crypto.randomBytes(4).toString('hex');
        const stmt = this.db.prepare(`
            INSERT INTO audit_logs (id, task_id, actor_name, actor_role, action, field_changed, old_value, new_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(auditId, taskId, actor.name || 'Anonymous', actor.role || 'viewer', action, fieldChanged, oldValue, newValue);
    }
}

module.exports = new TaskService();
