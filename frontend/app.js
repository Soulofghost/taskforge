let currentUser = { name: "Alex Mercer", role: "admin" };
let allTasks = [];
let allUsers = [];
let activeSprintId = "sprint-101";
let selectedTask = null;

document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    setupEventListeners();
    await loadUsers();
    await loadSprintData();
    await loadTasks();
}

function setupEventListeners() {
    // Role Switcher
    const roleSelect = document.getElementById("user-role-select");
    roleSelect.addEventListener("change", (e) => {
        const role = e.target.value;
        if (role === "admin") currentUser = { name: "Alex Mercer", role: "admin" };
        if (role === "member") currentUser = { name: "Devon Vance", role: "member" };
        if (role === "viewer") currentUser = { name: "Sara Croft", role: "viewer" };
        updateRoleUI();
    });

    // Create Task Modal
    const createModal = document.getElementById("create-modal");
    document.getElementById("btn-open-create-modal").addEventListener("click", () => {
        if (currentUser.role === "viewer") {
            alert("Access Denied: Viewers cannot create tasks.");
            return;
        }
        createModal.classList.add("open");
    });
    document.getElementById("btn-close-create-modal").addEventListener("click", () => {
        createModal.classList.remove("open");
    });
    document.getElementById("btn-cancel-task").addEventListener("click", () => {
        createModal.classList.remove("open");
    });

    // Create Form Submit
    document.getElementById("create-task-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        await handleCreateTask();
    });

    // Task Detail Modal Close
    const detailModal = document.getElementById("detail-modal");
    document.getElementById("btn-close-detail-modal").addEventListener("click", () => {
        detailModal.classList.remove("open");
    });

    // Delete Task
    document.getElementById("btn-delete-task").addEventListener("click", async () => {
        if (!selectedTask) return;
        if (currentUser.role !== "admin") {
            alert("Access Denied: Only Admins can delete sprint tasks.");
            return;
        }
        if (confirm(`Delete task "${selectedTask.title}"?`)) {
            await deleteTask(selectedTask.id);
        }
    });

    // Toggle Audit Drawer
    const auditDrawer = document.getElementById("audit-drawer");
    document.getElementById("btn-toggle-audit").addEventListener("click", async () => {
        auditDrawer.classList.toggle("open");
        if (auditDrawer.classList.contains("open")) {
            await loadAuditTrail();
        }
    });
    document.getElementById("btn-close-audit").addEventListener("click", () => {
        auditDrawer.classList.remove("open");
    });
}

function updateRoleUI() {
    const createBtn = document.getElementById("btn-open-create-modal");
    if (currentUser.role === "viewer") {
        createBtn.disabled = true;
    } else {
        createBtn.disabled = false;
    }
}

async function loadUsers() {
    try {
        const res = await fetch("/api/v1/users");
        if (res.ok) {
            allUsers = await res.json();
            const select = document.getElementById("task-assignee");
            select.innerHTML = '<option value="">Unassigned</option>';
            allUsers.forEach(u => {
                const opt = document.createElement("option");
                opt.value = u.id;
                opt.textContent = `${u.name} (${u.role})`;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Failed to load users:", e);
    }
}

async function loadSprintData() {
    try {
        const res = await fetch(`/api/v1/sprints/${activeSprintId}/metrics`);
        if (!res.ok) return;
        const metrics = await res.json();

        document.getElementById("sprint-name").textContent = metrics.sprint.name;
        document.getElementById("sprint-progress-text").textContent = `${metrics.progressPct}% Velocity (${metrics.completedPoints}/${metrics.totalPoints} pts)`;
        document.getElementById("sprint-bar-fill").style.width = `${metrics.progressPct}%`;
    } catch (e) {
        console.error("Sprint metrics error:", e);
    }
}

async function loadTasks() {
    try {
        const res = await fetch(`/api/v1/tasks?sprint_id=${activeSprintId}`);
        if (!res.ok) throw new Error("Failed to load tasks");
        allTasks = await res.json();
        renderBoard();
        await loadSprintData();
    } catch (e) {
        console.error("Error loading tasks:", e);
    }
}

function renderBoard() {
    const columns = {
        backlog: document.getElementById("col-backlog"),
        in_progress: document.getElementById("col-in_progress"),
        review: document.getElementById("col-review"),
        done: document.getElementById("col-done")
    };

    const counts = { backlog: 0, in_progress: 0, review: 0, done: 0 };
    Object.values(columns).forEach(col => col.innerHTML = "");

    let totalPoints = 0;

    allTasks.forEach(task => {
        counts[task.status] = (counts[task.status] || 0) + 1;
        totalPoints += task.points || 0;

        const card = document.createElement("div");
        card.className = "task-card";
        card.innerHTML = `
            <div class="card-meta-top">
                <span class="priority-tag prio-${task.priority}">${task.priority}</span>
                <span class="points-pill">${task.points} SP</span>
            </div>
            <div class="card-title">${escapeHtml(task.title)}</div>
            <div class="card-footer">
                <span>👤 ${escapeHtml(task.assignee_name || 'Unassigned')}</span>
                ${getAdvanceButtonHtml(task.status, task.id)}
            </div>
        `;

        card.addEventListener("click", (e) => {
            if (e.target.tagName !== "BUTTON") {
                openTaskDetail(task.id);
            }
        });

        const advBtn = card.querySelector(".advance-btn");
        if (advBtn) {
            advBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                advanceTaskStatus(task.id, advBtn.dataset.nextStatus);
            });
        }

        if (columns[task.status]) {
            columns[task.status].appendChild(card);
        }
    });

    document.getElementById("count-backlog").textContent = counts.backlog;
    document.getElementById("count-in_progress").textContent = counts.in_progress;
    document.getElementById("count-review").textContent = counts.review;
    document.getElementById("count-done").textContent = counts.done;

    document.getElementById("total-tasks-badge").textContent = `${allTasks.length} Tasks`;
    document.getElementById("total-points-badge").textContent = `${totalPoints} Story Points`;
}

function getAdvanceButtonHtml(currentStatus, taskId) {
    if (currentUser.role === "viewer") return "";
    const nextMap = {
        backlog: { next: "in_progress", label: "Start →" },
        in_progress: { next: "review", label: "Review →" },
        review: { next: "done", label: "Complete ✓" }
    };
    if (!nextMap[currentStatus]) return "";
    return `<button class="advance-btn" data-next-status="${nextMap[currentStatus].next}">${nextMap[currentStatus].label}</button>`;
}

async function advanceTaskStatus(taskId, newStatus) {
    try {
        const res = await fetch(`/api/v1/tasks/${taskId}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-User-Role": currentUser.role,
                "X-User-Name": currentUser.name
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Status update failed");
        }
        await loadTasks();
    } catch (e) {
        alert(e.message);
    }
}

async function handleCreateTask() {
    const title = document.getElementById("task-title").value.trim();
    const description = document.getElementById("task-desc").value.trim();
    const priority = document.getElementById("task-priority").value;
    const points = parseInt(document.getElementById("task-points").value) || 1;
    const assignee_id = document.getElementById("task-assignee").value || null;

    try {
        const res = await fetch("/api/v1/tasks", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-User-Role": currentUser.role,
                "X-User-Name": currentUser.name
            },
            body: JSON.stringify({
                sprint_id: activeSprintId,
                title,
                description,
                priority,
                points,
                assignee_id
            })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to create task");
        }

        document.getElementById("create-modal").classList.remove("open");
        document.getElementById("create-task-form").reset();
        await loadTasks();
    } catch (e) {
        alert(e.message);
    }
}

async function openTaskDetail(taskId) {
    try {
        const res = await fetch(`/api/v1/tasks/${taskId}`);
        if (!res.ok) throw new Error("Task not found");
        selectedTask = await res.json();

        document.getElementById("detail-id").textContent = selectedTask.id;
        document.getElementById("detail-title").textContent = selectedTask.title;
        document.getElementById("detail-priority").textContent = `Priority: ${selectedTask.priority.toUpperCase()}`;
        document.getElementById("detail-points").textContent = `${selectedTask.points} Story Points`;
        document.getElementById("detail-assignee").textContent = `Assignee: ${selectedTask.assignee_name || 'Unassigned'}`;
        document.getElementById("detail-description").textContent = selectedTask.description;

        const delBtn = document.getElementById("btn-delete-task");
        delBtn.disabled = (currentUser.role !== "admin");

        // Render Audit Timeline
        const auditList = document.getElementById("detail-audit-list");
        auditList.innerHTML = "";
        (selectedTask.auditLogs || []).forEach(log => {
            const row = document.createElement("div");
            row.className = "audit-entry";
            row.innerHTML = `
                <div><span class="audit-actor">${escapeHtml(log.actor_name)} (${log.actor_role})</span>: ${escapeHtml(log.action)}</div>
                <div style="color:var(--text-secondary);">${escapeHtml(log.field_changed || '')} ${log.old_value ? `"${log.old_value}" → "${log.new_value}"` : ''}</div>
                <span class="audit-time">${new Date(log.timestamp).toLocaleString()}</span>
            `;
            auditList.appendChild(row);
        });

        document.getElementById("detail-modal").classList.add("open");
    } catch (e) {
        console.error("Detail error:", e);
    }
}

async function deleteTask(taskId) {
    try {
        const res = await fetch(`/api/v1/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
                "X-User-Role": currentUser.role,
                "X-User-Name": currentUser.name
            }
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Delete failed");
        }

        document.getElementById("detail-modal").classList.remove("open");
        selectedTask = null;
        await loadTasks();
    } catch (e) {
        alert(e.message);
    }
}

async function loadAuditTrail() {
    try {
        const res = await fetch("/api/v1/audit?limit=30");
        if (!res.ok) return;
        const logs = await res.json();
        const list = document.getElementById("audit-log-list");
        list.innerHTML = "";

        if (logs.length === 0) {
            list.innerHTML = `<div style="color:var(--text-muted); font-size:11px; text-align:center;">No audit records.</div>`;
            return;
        }

        logs.forEach(log => {
            const entry = document.createElement("div");
            entry.className = "audit-entry";
            entry.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <span class="audit-actor">${escapeHtml(log.actor_name)} [${log.actor_role}]</span>
                    <span class="audit-time">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(log.task_title || log.task_id)}</div>
                <div style="color:var(--text-secondary);">${escapeHtml(log.action)}: ${escapeHtml(log.field_changed || '')} ${log.old_value ? `"${log.old_value}" → "${log.new_value}"` : ''}</div>
            `;
            list.appendChild(entry);
        });
    } catch (e) {
        console.error("Audit load error:", e);
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
