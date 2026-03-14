// ─────────────────────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:3000/api';

// ─────────────────────────────────────────────────────────────
//  TOKEN / USER  (sessionStorage instead of localStorage)
// ─────────────────────────────────────────────────────────────
function getToken() { return sessionStorage.getItem('authToken'); }
function getUser()  { try { return JSON.parse(sessionStorage.getItem('authUser')); } catch { return null; } }
function saveAuth(token, user) {
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('authUser', JSON.stringify(user));
}
function clearAuth() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('authUser');
}

// ─────────────────────────────────────────────────────────────
//  API HELPER  (replaces direct localStorage reads/writes)
// ─────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    const token = getToken();
    const res = await fetch(API_BASE + endpoint, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(options.headers || {})
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ─────────────────────────────────────────────────────────────
//  AUTH STATE  (same as before — toggles body classes)
// ─────────────────────────────────────────────────────────────
function setAuthState(isAuth, user = null) {
    const body = document.body;
    if (isAuth && user) {
        body.classList.remove('not-authenticated');
        body.classList.add('authenticated');
        body.classList.toggle('is-admin', user.role === 'admin');
        const nav = document.getElementById('nav-username');
        if (nav) nav.textContent = user.firstName || user.username;
    } else {
        body.classList.remove('authenticated', 'is-admin');
        body.classList.add('not-authenticated');
    }
}

// ─────────────────────────────────────────────────────────────
//  ROUTING  (same hash-based system as Activity 1)
// ─────────────────────────────────────────────────────────────
function navigateTo(hash) {
    window.location.hash = hash;
}

function handleRouting() {
    const hash  = window.location.hash || '#/';
    const route = hash.replace('#/', '');

    // hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const user = getUser();
    const isLoggedIn = !!getToken();

    // protected routes
    const protectedRoutes = ['profile', 'requests'];
    const adminRoutes     = ['admin/accounts', 'admin/departments', 'admin/employees', 'admin/requests'];

    if (protectedRoutes.some(r => route.startsWith(r)) && !isLoggedIn) {
        showToast('Please login to access this page', 'warning');
        navigateTo('#/login');
        return;
    }
    if (adminRoutes.some(r => route.startsWith(r))) {
        if (!isLoggedIn) { navigateTo('#/login'); return; }
        if (user?.role !== 'admin') {
            showToast('Access denied. Admin only.', 'danger');
            navigateTo('#/');
            return;
        }
    }

    // show the right page and trigger its render
    switch (route) {
        case '':
            show('home-page');
            break;
        case 'register':
            show('register-page');
            break;
        case 'verify':
            show('verify-page');
            const email = sessionStorage.getItem('pendingVerifyEmail');
            document.getElementById('verify-email-display').textContent = email || '';
            break;
        case 'login':
            show('login-page');
            break;
        case 'profile':
            show('profile-page');
            renderProfile();
            break;
        case 'requests':
            show('requests-page');
            renderRequests();
            break;
        case 'admin/accounts':
            show('admin-accounts-page');
            renderAccountsList();
            break;
        case 'admin/departments':
            show('admin-departments-page');
            renderDepartmentsList();
            break;
        case 'admin/employees':
            show('admin-employees-page');
            renderEmployeesList();
            break;
        case 'admin/requests':
            show('admin-requests-page');
            renderAdminRequestsList();
            break;
        default:
            show('home-page');
    }
}

function show(id) {
    document.getElementById(id)?.classList.add('active');
}

// ─────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // restore session
    const user = getUser();
    if (getToken() && user) setAuthState(true, user);

    // set up hash routing
    window.addEventListener('hashchange', handleRouting);
    if (!window.location.hash) window.location.hash = '#/';
    handleRouting();

    // form listeners
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('request-form')?.addEventListener('submit', handleRequestSubmit);
    document.getElementById('account-form')?.addEventListener('submit', handleAccountSave);
    document.getElementById('dept-form')?.addEventListener('submit', handleDeptSave);
    document.getElementById('employee-form')?.addEventListener('submit', handleEmployeeSave);
});

// ─────────────────────────────────────────────────────────────
//  REGISTER
//  OLD: window.db.accounts.push(...); localStorage.setItem(...)
//  NEW: POST /api/register
// ─────────────────────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();
    const btn    = document.getElementById('register-btn');
    const errDiv = document.getElementById('register-error');
    errDiv.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Registering...';

    try {
        await apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify({
                firstName: document.getElementById('reg-firstname').value,
                lastName:  document.getElementById('reg-lastname').value,
                username:  document.getElementById('reg-username').value,
                email:     document.getElementById('reg-email').value,
                password:  document.getElementById('reg-password').value,
            })
        });

        // store email for verify page (same idea as old unverifiedemail in localStorage)
        sessionStorage.setItem('pendingVerifyEmail', document.getElementById('reg-email').value);
        showToast('Account created! Please verify your email.', 'success');
        navigateTo('#/verify');
    } catch (err) {
        errDiv.textContent = err.message;
        errDiv.classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Register';
    }
}

// ─────────────────────────────────────────────────────────────
//  EMAIL VERIFICATION
//  OLD: account.verified = true; saveToStorage()
//  NEW: POST /api/verify-email
// ─────────────────────────────────────────────────────────────
async function simulateEmailVerification() {
    const btn   = document.getElementById('simulate-verify-btn');
    const email = sessionStorage.getItem('pendingVerifyEmail');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        await apiFetch('/verify-email', { method: 'POST', body: JSON.stringify({ email }) });
        sessionStorage.removeItem('pendingVerifyEmail');
        showToast('Email verified! You can now login.', 'success');
        navigateTo('#/login');
    } catch (err) {
        showToast(err.message, 'danger');
        btn.disabled = false;
        btn.textContent = '✅ Simulate Email Verification';
    }
}

// ─────────────────────────────────────────────────────────────
//  LOGIN
//  OLD: localStorage.setItem('auth_token', email); setAuthState(true, user)
//  NEW: POST /api/login  →  get JWT token  →  sessionStorage
// ─────────────────────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const btn    = document.getElementById('login-btn');
    const errDiv = document.getElementById('login-error');
    errDiv.classList.add('d-none');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    try {
        const data = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({
                username: document.getElementById('login-username').value,
                password: document.getElementById('login-password').value,
            })
        });

        saveAuth(data.token, data.user);   // replaces localStorage.setItem('auth_token', email)
        setAuthState(true, data.user);
        showToast(`Welcome back, ${data.user.firstName || data.user.username}!`, 'success');
        navigateTo('#/profile');
    } catch (err) {
        errDiv.textContent = err.message;
        errDiv.classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
    }
}

// ─────────────────────────────────────────────────────────────
//  LOGOUT
//  OLD: localStorage.removeItem('auth_token'); setAuthState(false)
//  NEW: same idea, but clear sessionStorage token
// ─────────────────────────────────────────────────────────────
function logout() {
    clearAuth();                // replaces localStorage.removeItem('auth_token')
    setAuthState(false);
    showToast('Logged out successfully', 'info');
    navigateTo('#/');
}

// ─────────────────────────────────────────────────────────────
//  PROFILE
//  OLD: render from currentUser object in memory
//  NEW: GET /api/profile  (also verifies token is still valid)
// ─────────────────────────────────────────────────────────────
async function renderProfile() {
    document.getElementById('profile-content').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;

    try {
        const user = await apiFetch('/profile');   // verifies JWT with server (Step 3)
        saveAuth(getToken(), user);                 // refresh local user data
        setAuthState(true, user);

        document.getElementById('profile-content').innerHTML = `
            <div class="profile-info">
                <h5 class="fw-bold mb-4">${user.firstName} ${user.lastName}</h5>
                <div class="row mb-3"><div class="col-4 text-muted">Username</div><div class="col-8"><strong>${user.username}</strong></div></div>
                <div class="row mb-3"><div class="col-4 text-muted">Email</div><div class="col-8">${user.email}</div></div>
                <div class="row mb-3">
                    <div class="col-4 text-muted">Role</div>
                    <div class="col-8"><span class="badge ${user.role === 'admin' ? 'bg-danger' : 'bg-primary'}">${user.role.toUpperCase()}</span></div>
                </div>
                <div class="row mb-4"><div class="col-4 text-muted">Status</div><div class="col-8"><span class="badge bg-success">Verified</span></div></div>
                <button class="btn btn-primary" onclick="showToast('Edit profile coming soon!','info')">Edit Profile</button>
            </div>`;
    } catch (err) {
        clearAuth();
        showToast('Session expired. Please login again.', 'danger');
        navigateTo('#/login');
    }
}

// ─────────────────────────────────────────────────────────────
//  MY REQUESTS
//  OLD: window.db.requests.filter(r => r.employeeEmail === currentUser.email)
//  NEW: GET /api/requests  (backend filters by token user)
// ─────────────────────────────────────────────────────────────
async function renderRequests() {
    document.getElementById('requests-list').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;

    try {
        const list = await apiFetch('/requests');

        if (!list.length) {
            document.getElementById('requests-list').innerHTML =
                `<div class="alert alert-info">No requests yet. Click <strong>+ New Request</strong> to create one.</div>`;
            return;
        }

        const rows = list.map(req => {
            const badge = req.status === 'Pending' ? 'warning text-dark' : req.status === 'Approved' ? 'success' : 'danger';
            const items = req.items.map(i => `${i.name} (${i.qty})`).join(', ');
            return `<tr>
                <td>${req.type}</td>
                <td>${items}</td>
                <td>${new Date(req.date).toLocaleDateString()}</td>
                <td><span class="badge bg-${badge}">${req.status}</span></td>
            </tr>`;
        }).join('');

        document.getElementById('requests-list').innerHTML = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead><tr><th>Type</th><th>Items</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (err) { showToast(err.message, 'danger'); }
}

// request item helpers (same as Activity 1)
function addRequestItem() {
    const c   = document.getElementById('request-items-container');
    const div = document.createElement('div');
    div.className = 'row mb-2 request-item';
    div.innerHTML = `
        <div class="col-7"><input type="text" class="form-control item-name" placeholder="Item name" required></div>
        <div class="col-3"><input type="number" class="form-control item-qty" placeholder="Qty" min="1" value="1" required></div>
        <div class="col-2"><button type="button" class="btn btn-sm btn-danger" onclick="removeRequestItem(this)">×</button></div>`;
    c.appendChild(div);
}
function removeRequestItem(btn) { btn.closest('.request-item').remove(); }

// ─────────────────────────────────────────────────────────────
//  SUBMIT REQUEST
//  OLD: window.db.requests.push(...); saveToStorage()
//  NEW: POST /api/requests
// ─────────────────────────────────────────────────────────────
async function handleRequestSubmit(e) {
    e.preventDefault();
    const btn   = document.getElementById('submit-request-btn');
    const items = [...document.querySelectorAll('.request-item')].map(row => ({
        name: row.querySelector('.item-name').value,
        qty:  parseInt(row.querySelector('.item-qty').value)
    })).filter(i => i.name);

    if (!items.length) { showToast('Add at least one item', 'warning'); return; }

    btn.disabled = true;
    try {
        await apiFetch('/requests', {
            method: 'POST',
            body: JSON.stringify({ type: document.getElementById('request-type').value, items })
        });
        bootstrap.Modal.getInstance(document.getElementById('requestModal')).hide();
        document.getElementById('request-form').reset();
        showToast('Request submitted!', 'success');
        renderRequests();
    } catch (err) { showToast(err.message, 'danger'); }
    finally { btn.disabled = false; }
}

// ─────────────────────────────────────────────────────────────
//  ADMIN: ACCOUNTS
//  OLD: window.db.accounts (array in memory + localStorage)
//  NEW: GET/POST/PUT/DELETE /api/admin/accounts
// ─────────────────────────────────────────────────────────────
let _accounts = [];

async function renderAccountsList() {
    document.getElementById('accounts-list').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;
    try {
        _accounts = await apiFetch('/admin/accounts');
        const rows = _accounts.map(acc => `
            <tr>
                <td>${acc.firstName} ${acc.lastName}</td>
                <td>${acc.email}</td>
                <td><span class="badge ${acc.role === 'admin' ? 'bg-danger' : 'bg-primary'}">${acc.role}</span></td>
                <td>${acc.verified ? '<span class="text-success fw-bold">✓</span>' : '<span class="text-muted">—</span>'}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-primary"  onclick="editAccount(${acc.id})">Edit</button>
                    <button class="btn btn-sm btn-warning"  onclick="resetPassword(${acc.id})">Reset PW</button>
                    <button class="btn btn-sm btn-danger"   onclick="deleteAccount(${acc.id})">Delete</button>
                </td>
            </tr>`).join('');

        document.getElementById('accounts-list').innerHTML = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (err) { showToast(err.message, 'danger'); }
}

function openAccountModal(acc = null) {
    document.getElementById('account-form').reset();
    document.getElementById('account-id').value = '';
    document.getElementById('accountModalTitle').textContent = acc ? 'Edit Account' : 'Add Account';
    document.getElementById('account-password').required = !acc;

    if (acc) {
        document.getElementById('account-id').value        = acc.id;
        document.getElementById('account-firstname').value = acc.firstName;
        document.getElementById('account-lastname').value  = acc.lastName;
        document.getElementById('account-username').value  = acc.username;
        document.getElementById('account-email').value     = acc.email;
        document.getElementById('account-role').value      = acc.role;
        document.getElementById('account-verified').checked = acc.verified;
    }
    new bootstrap.Modal(document.getElementById('accountModal')).show();
}

function editAccount(id) { openAccountModal(_accounts.find(a => a.id === id)); }

async function handleAccountSave(e) {
    e.preventDefault();
    const btn = document.getElementById('account-save-btn');
    btn.disabled = true;
    const id = document.getElementById('account-id').value;
    const body = {
        firstName: document.getElementById('account-firstname').value,
        lastName:  document.getElementById('account-lastname').value,
        username:  document.getElementById('account-username').value,
        email:     document.getElementById('account-email').value,
        password:  document.getElementById('account-password').value,
        role:      document.getElementById('account-role').value,
        verified:  document.getElementById('account-verified').checked,
    };
    try {
        if (id) await apiFetch(`/admin/accounts/${id}`, { method: 'PUT',  body: JSON.stringify(body) });
        else    await apiFetch('/admin/accounts',        { method: 'POST', body: JSON.stringify(body) });
        bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
        showToast('Account saved!', 'success');
        renderAccountsList();
    } catch (err) { showToast(err.message, 'danger'); }
    finally { btn.disabled = false; }
}

async function resetPassword(id) {
    const pw = prompt('Enter new password (min 6 characters):');
    if (!pw) return;
    if (pw.length < 6) { showToast('Password must be at least 6 characters', 'danger'); return; }
    try {
        await apiFetch(`/admin/accounts/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password: pw }) });
        showToast('Password reset successfully', 'success');
    } catch (err) { showToast(err.message, 'danger'); }
}

async function deleteAccount(id) {
    const me = getUser();
    if (me && me.id === id) { showToast('Cannot delete your own account', 'danger'); return; }
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
        await apiFetch(`/admin/accounts/${id}`, { method: 'DELETE' });
        showToast('Account deleted', 'success');
        renderAccountsList();
    } catch (err) { showToast(err.message, 'danger'); }
}

// ─────────────────────────────────────────────────────────────
//  ADMIN: DEPARTMENTS
//  OLD: window.db.departments
//  NEW: GET/POST/PUT/DELETE /api/admin/departments
// ─────────────────────────────────────────────────────────────
let _departments = [];

async function renderDepartmentsList() {
    document.getElementById('departments-list').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;
    try {
        _departments = await apiFetch('/admin/departments');
        const rows = _departments.map(d => `
            <tr>
                <td>${d.name}</td>
                <td>${d.description}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editDept(${d.id})">Edit</button>
                    <button class="btn btn-sm btn-danger"  onclick="deleteDept(${d.id})">Delete</button>
                </td>
            </tr>`).join('');

        document.getElementById('departments-list').innerHTML = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (err) { showToast(err.message, 'danger'); }
}

function openDeptModal(dept = null) {
    document.getElementById('dept-form').reset();
    document.getElementById('dept-id').value = '';
    document.getElementById('deptModalTitle').textContent = dept ? 'Edit Department' : 'Add Department';
    if (dept) {
        document.getElementById('dept-id').value   = dept.id;
        document.getElementById('dept-name').value = dept.name;
        document.getElementById('dept-desc').value = dept.description;
    }
    new bootstrap.Modal(document.getElementById('deptModal')).show();
}

function editDept(id) { openDeptModal(_departments.find(d => d.id === id)); }

async function handleDeptSave(e) {
    e.preventDefault();
    const btn  = document.getElementById('dept-save-btn');
    btn.disabled = true;
    const id   = document.getElementById('dept-id').value;
    const body = { name: document.getElementById('dept-name').value, description: document.getElementById('dept-desc').value };
    try {
        if (id) await apiFetch(`/admin/departments/${id}`, { method: 'PUT',  body: JSON.stringify(body) });
        else    await apiFetch('/admin/departments',        { method: 'POST', body: JSON.stringify(body) });
        bootstrap.Modal.getInstance(document.getElementById('deptModal')).hide();
        showToast('Department saved!', 'success');
        renderDepartmentsList();
    } catch (err) { showToast(err.message, 'danger'); }
    finally { btn.disabled = false; }
}

async function deleteDept(id) {
    if (!confirm('Delete this department?')) return;
    try {
        await apiFetch(`/admin/departments/${id}`, { method: 'DELETE' });
        showToast('Department deleted', 'success');
        renderDepartmentsList();
    } catch (err) { showToast(err.message, 'danger'); }
}

// ─────────────────────────────────────────────────────────────
//  ADMIN: EMPLOYEES
//  OLD: window.db.employees
//  NEW: GET/POST/PUT/DELETE /api/admin/employees
// ─────────────────────────────────────────────────────────────
let _employees = [];

async function renderEmployeesList() {
    document.getElementById('employees-list').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;
    try {
        [_employees, _accounts, _departments] = await Promise.all([
            apiFetch('/admin/employees'),
            apiFetch('/admin/accounts'),
            apiFetch('/admin/departments')
        ]);

        const rows = _employees.map(emp => {
            const acc  = _accounts.find(a => a.id === emp.userId);
            const dept = _departments.find(d => d.id === emp.deptId);
            return `<tr>
                <td>${emp.employeeId}</td>
                <td>${acc ? acc.email : 'N/A'}</td>
                <td>${emp.position}</td>
                <td>${dept ? dept.name : 'N/A'}</td>
                <td>${new Date(emp.hireDate).toLocaleDateString()}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="editEmployee(${emp.id})">Edit</button>
                    <button class="btn btn-sm btn-danger"  onclick="deleteEmployee(${emp.id})">Delete</button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('employees-list').innerHTML = _employees.length ? `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead><tr><th>ID</th><th>User</th><th>Position</th><th>Department</th><th>Hire Date</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>` : `<div class="alert alert-info">No employees yet.</div>`;
    } catch (err) { showToast(err.message, 'danger'); }
}

async function openEmployeeModal(emp = null) {
    // make sure we have fresh accounts & departments for dropdowns
    if (!_accounts.length)    _accounts    = await apiFetch('/admin/accounts').catch(() => []);
    if (!_departments.length) _departments = await apiFetch('/admin/departments').catch(() => []);

    document.getElementById('employee-form').reset();
    document.getElementById('employee-id').value = '';
    document.getElementById('employeeModalTitle').textContent = emp ? 'Edit Employee' : 'Add Employee';

    document.getElementById('employee-userid').innerHTML =
        '<option value="">Select user...</option>' +
        _accounts.map(a => `<option value="${a.id}">${a.email}</option>`).join('');

    document.getElementById('employee-deptid').innerHTML =
        '<option value="">Select department...</option>' +
        _departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

    if (emp) {
        document.getElementById('employee-id').value       = emp.id;
        document.getElementById('employee-empid').value    = emp.employeeId;
        document.getElementById('employee-userid').value   = emp.userId;
        document.getElementById('employee-position').value = emp.position;
        document.getElementById('employee-deptid').value   = emp.deptId;
        document.getElementById('employee-hiredate').value = emp.hireDate;
    }
    new bootstrap.Modal(document.getElementById('employeeModal')).show();
}

function editEmployee(id) { openEmployeeModal(_employees.find(e => e.id === id)); }

async function handleEmployeeSave(e) {
    e.preventDefault();
    const btn = document.getElementById('employee-save-btn');
    btn.disabled = true;
    const id   = document.getElementById('employee-id').value;
    const body = {
        employeeId: document.getElementById('employee-empid').value,
        userId:     document.getElementById('employee-userid').value,
        position:   document.getElementById('employee-position').value,
        deptId:     document.getElementById('employee-deptid').value,
        hireDate:   document.getElementById('employee-hiredate').value,
    };
    try {
        if (id) await apiFetch(`/admin/employees/${id}`, { method: 'PUT',  body: JSON.stringify(body) });
        else    await apiFetch('/admin/employees',        { method: 'POST', body: JSON.stringify(body) });
        bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
        showToast('Employee saved!', 'success');
        renderEmployeesList();
    } catch (err) { showToast(err.message, 'danger'); }
    finally { btn.disabled = false; }
}

async function deleteEmployee(id) {
    if (!confirm('Delete this employee?')) return;
    try {
        await apiFetch(`/admin/employees/${id}`, { method: 'DELETE' });
        showToast('Employee deleted', 'success');
        renderEmployeesList();
    } catch (err) { showToast(err.message, 'danger'); }
}

// ─────────────────────────────────────────────────────────────
//  ADMIN: ALL REQUESTS
//  OLD: window.db.requests (all of them)
//  NEW: GET /api/requests  (admin gets all, user gets own)
// ─────────────────────────────────────────────────────────────
async function renderAdminRequestsList() {
    document.getElementById('admin-requests-list').innerHTML =
        `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;
    try {
        const list = await apiFetch('/requests');

        if (!list.length) {
            document.getElementById('admin-requests-list').innerHTML =
                `<div class="alert alert-info">No requests submitted yet.</div>`;
            return;
        }

        const rows = list.map(req => {
            const badge   = req.status === 'Pending' ? 'warning text-dark' : req.status === 'Approved' ? 'success' : 'danger';
            const items   = req.items.map(i => `${i.name} (${i.qty})`).join(', ');
            const actions = req.status === 'Pending'
                ? `<button class="btn btn-sm btn-success" onclick="updateRequestStatus(${req.id},'Approved')">Approve</button>
                   <button class="btn btn-sm btn-danger ms-1" onclick="updateRequestStatus(${req.id},'Rejected')">Reject</button>`
                : `<span class="badge bg-secondary">${req.status}</span>`;
            return `<tr>
                <td>${req.employeeEmail}</td>
                <td>${req.type}</td>
                <td>${items}</td>
                <td>${new Date(req.date).toLocaleDateString()}</td>
                <td><span class="badge bg-${badge}">${req.status}</span></td>
                <td class="action-buttons">
                    ${actions}
                    <button class="btn btn-sm btn-outline-danger ms-1" onclick="deleteRequest(${req.id})">🗑</button>
                </td>
            </tr>`;
        }).join('');

        document.getElementById('admin-requests-list').innerHTML = `
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead><tr><th>User</th><th>Type</th><th>Items</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
    } catch (err) { showToast(err.message, 'danger'); }
}

async function updateRequestStatus(id, status) {
    try {
        await apiFetch(`/admin/requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        showToast(`Request ${status.toLowerCase()}!`, 'success');
        renderAdminRequestsList();
    } catch (err) { showToast(err.message, 'danger'); }
}

async function deleteRequest(id) {
    if (!confirm('Delete this request?')) return;
    try {
        await apiFetch(`/requests/${id}`, { method: 'DELETE' });
        showToast('Request deleted', 'success');
        renderAdminRequestsList();
    } catch (err) { showToast(err.message, 'danger'); }
}

// ─────────────────────────────────────────────────────────────
//  TOAST  (same as Activity 1)
// ─────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const bgMap = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning text-dark', info: 'bg-info text-dark' };
    const id  = 'toast-' + Date.now();
    container.insertAdjacentHTML('beforeend', `
        <div id="${id}" class="toast align-items-center text-white ${bgMap[type] || 'bg-secondary'} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>`);
    const el = document.getElementById(id);
    new bootstrap.Toast(el, { delay: 3000 }).show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}