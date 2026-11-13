const ROLE_PERMISSIONS = {
    admin: [
        'task:read', 'task:create', 'task:update', 'task:delete', 'task:status',
        'sprint:manage', 'audit:read', 'user:manage'
    ],
    member: [
        'task:read', 'task:create', 'task:update', 'task:status', 'audit:read'
    ],
    viewer: [
        'task:read', 'audit:read'
    ]
};

function hasPermission(role, action) {
    if (!role || !ROLE_PERMISSIONS[role]) return false;
    return ROLE_PERMISSIONS[role].includes(action);
}

function enforcePermission(role, action) {
    if (!hasPermission(role, action)) {
        const error = new Error(`Access Denied: Role '${role || 'unassigned'}' lacks permission for '${action}'`);
        error.statusCode = 403;
        throw error;
    }
}

module.exports = {
    ROLE_PERMISSIONS,
    hasPermission,
    enforcePermission
};
