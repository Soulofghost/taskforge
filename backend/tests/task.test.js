const test = require('node:test');
const assert = require('node:assert');
const taskService = require('../src/taskService');

const adminActor = { name: 'Admin Test', role: 'admin' };
const memberActor = { name: 'Member Test', role: 'member' };
const viewerActor = { name: 'Viewer Test', role: 'viewer' };

test('Task Lifecycle: creates, moves status, records audit logs', () => {
    // 1. Create task
    const task = taskService.createTask({
        sprint_id: 'sprint-101',
        title: 'Implement Multi-Factor Auth Guard',
        description: 'Enforce TOTP and WebAuthn challenges on privileged admin routes.',
        priority: 'high',
        points: 5,
        assignee_id: 'usr-1'
    }, memberActor);

    assert.ok(task.id.startsWith('task-'));
    assert.strictEqual(task.status, 'backlog');
    assert.strictEqual(task.points, 5);

    // 2. Advance Status to in_progress
    const progressed = taskService.updateTaskStatus(task.id, 'in_progress', memberActor);
    assert.strictEqual(progressed.status, 'in_progress');

    // 3. Advance Status to done
    const doneTask = taskService.updateTaskStatus(task.id, 'done', memberActor);
    assert.strictEqual(doneTask.status, 'done');

    // 4. Verify Audit Trail contains transitions
    const taskDetail = taskService.getTaskById(task.id);
    assert.ok(taskDetail.auditLogs.length >= 3);
    const statusLogs = taskDetail.auditLogs.filter(a => a.action === 'STATUS_CHANGE');
    assert.ok(statusLogs.length >= 2);
    assert.strictEqual(statusLogs[0].new_value, 'done');

    // 5. Member cannot delete
    assert.throws(() => {
        taskService.deleteTask(task.id, memberActor);
    }, /Access Denied/);

    // 6. Admin can delete
    const delRes = taskService.deleteTask(task.id, adminActor);
    assert.strictEqual(delRes.status, 'deleted');
});

test('Sprint Metrics: computes burndown and completion percentages', () => {
    const metrics = taskService.getActiveSprintMetrics('sprint-101');
    assert.ok(metrics !== null);
    assert.ok(metrics.totalPoints > 0);
    assert.ok(metrics.taskCount > 0);
    assert.ok(typeof metrics.progressPct === 'number');
});
