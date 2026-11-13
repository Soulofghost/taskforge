const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { PORT, STATIC_DIR } = require('./config');
const taskService = require('./taskService');

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Role, X-User-Name'
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function getActor(req) {
    return {
        name: req.headers['x-user-name'] || 'Alex Mercer',
        role: req.headers['x-user-role'] || 'admin'
    };
}

const server = http.createServer(async (req, res) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-Role, X-User-Name'
        });
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const actor = getActor(req);

    try {
        // Health
        if (pathname === '/api/v1/health' && req.method === 'GET') {
            return sendJson(res, 200, {
                status: 'healthy',
                service: 'TaskForge SaaS Gateway',
                version: '1.0.0',
                engine: 'SQLite WAL Mode'
            });
        }

        // Users
        if (pathname === '/api/v1/users' && req.method === 'GET') {
            return sendJson(res, 200, taskService.getUsers());
        }

        // Sprints
        if (pathname === '/api/v1/sprints' && req.method === 'GET') {
            return sendJson(res, 200, taskService.getSprints());
        }

        // Sprint Metrics: /api/v1/sprints/:id/metrics
        const sprintMetricMatch = pathname.match(/^\/api\/v1\/sprints\/([a-zA-Z0-9_-]+)\/metrics$/);
        if (sprintMetricMatch && req.method === 'GET') {
            const metrics = taskService.getActiveSprintMetrics(sprintMetricMatch[1]);
            if (!metrics) return sendJson(res, 404, { error: 'Sprint not found' });
            return sendJson(res, 200, metrics);
        }

        // Tasks list / create
        if (pathname === '/api/v1/tasks' && req.method === 'GET') {
            const sprintId = parsedUrl.searchParams.get('sprint_id');
            const tasks = taskService.getTasks(sprintId);
            return sendJson(res, 200, tasks);
        }

        if (pathname === '/api/v1/tasks' && req.method === 'POST') {
            const body = await parseJsonBody(req);
            if (!body.title || !body.sprint_id) {
                return sendJson(res, 400, { error: 'Title and sprint_id are required' });
            }
            const task = taskService.createTask(body, actor);
            return sendJson(res, 201, task);
        }

        // Task Detail: /api/v1/tasks/:id
        const taskIdMatch = pathname.match(/^\/api\/v1\/tasks\/([a-zA-Z0-9_-]+)$/);
        if (taskIdMatch && req.method === 'GET') {
            const task = taskService.getTaskById(taskIdMatch[1]);
            if (!task) return sendJson(res, 404, { error: 'Task not found' });
            return sendJson(res, 200, task);
        }

        // Task Status: /api/v1/tasks/:id/status
        const taskStatusMatch = pathname.match(/^\/api\/v1\/tasks\/([a-zA-Z0-9_-]+)\/status$/);
        if (taskStatusMatch && req.method === 'PATCH') {
            const body = await parseJsonBody(req);
            if (!body.status) return sendJson(res, 400, { error: 'Missing status' });
            const updated = taskService.updateTaskStatus(taskStatusMatch[1], body.status, actor);
            return sendJson(res, 200, updated);
        }

        // Task Update: /api/v1/tasks/:id
        if (taskIdMatch && req.method === 'PUT') {
            const body = await parseJsonBody(req);
            const updated = taskService.updateTask(taskIdMatch[1], body, actor);
            return sendJson(res, 200, updated);
        }

        // Task Delete: /api/v1/tasks/:id
        if (taskIdMatch && req.method === 'DELETE') {
            const result = taskService.deleteTask(taskIdMatch[1], actor);
            return sendJson(res, 200, result);
        }

        // Audit Logs: /api/v1/audit
        if (pathname === '/api/v1/audit' && req.method === 'GET') {
            const limit = parseInt(parsedUrl.searchParams.get('limit') || '50');
            return sendJson(res, 200, taskService.getAuditLogs(limit));
        }

        // Static Files
        let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            filePath = path.join(STATIC_DIR, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                return res.end('File not found');
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });

    } catch (err) {
        const code = err.statusCode || (err.message.startsWith('Access Denied') ? 403 : 500);
        sendJson(res, code, { error: err.message });
    }
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`[TaskForge] Server listening on http://localhost:${PORT}`);
    });
}

module.exports = server;
