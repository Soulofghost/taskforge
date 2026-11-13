const test = require('node:test');
const assert = require('node:assert');
const { hasPermission, enforcePermission } = require('../src/rbac');

test('RBAC: Admin has all core permissions', () => {
    assert.strictEqual(hasPermission('admin', 'task:create'), true);
    assert.strictEqual(hasPermission('admin', 'task:update'), true);
    assert.strictEqual(hasPermission('admin', 'task:delete'), true);
    assert.strictEqual(hasPermission('admin', 'sprint:manage'), true);
});

test('RBAC: Member can create and update tasks but cannot delete', () => {
    assert.strictEqual(hasPermission('member', 'task:create'), true);
    assert.strictEqual(hasPermission('member', 'task:status'), true);
    assert.strictEqual(hasPermission('member', 'task:delete'), false);
    assert.strictEqual(hasPermission('member', 'sprint:manage'), false);
});

test('RBAC: Viewer has read-only access', () => {
    assert.strictEqual(hasPermission('viewer', 'task:read'), true);
    assert.strictEqual(hasPermission('viewer', 'task:create'), false);
    assert.strictEqual(hasPermission('viewer', 'task:status'), false);
    assert.strictEqual(hasPermission('viewer', 'task:delete'), false);
});

test('RBAC: Enforce permission throws on unauthorized action', () => {
    assert.throws(() => {
        enforcePermission('member', 'task:delete');
    }, /Access Denied/);

    assert.throws(() => {
        enforcePermission('viewer', 'task:create');
    }, /Access Denied/);
});
