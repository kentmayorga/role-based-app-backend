const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'your-very-secure-secret';

app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://127.0.0.1:3000', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());

// ─── In-memory DB ────────────────────────────────────────────────────────────
let users = [
    { id: 1, firstName: 'Admin', lastName: 'User',   username: 'admin', email: 'admin@example.com', role: 'admin',  verified: true,  password: '' },
    { id: 2, firstName: 'Alice', lastName: 'Smith',  username: 'alice', email: 'alice@example.com', role: 'user',   verified: true,  password: '' },
];

let departments = [
    { id: 1, name: 'Engineering',     description: 'Software development and IT' },
    { id: 2, name: 'Human Resources', description: 'HR and employee management'  },
];

let employees = [];
let requests  = [];
let nextUserId = 3;

// Hash seed passwords on boot
(async () => {
    users[0].password = await bcrypt.hash('admin123', 10);
    users[1].password = await bcrypt.hash('user123',  10);
    console.log('✅ Seed passwords hashed.');
})();

// ─── Middleware ───────────────────────────────────────────────────────────────
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role))
            return res.status(403).json({ error: 'Access denied: insufficient permissions' });
        next();
    };
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────

// Register
app.post('/api/register', async (req, res) => {
    const { firstName, lastName, username, email, password } = req.body;

    if (!username || !password || !email)
        return res.status(400).json({ error: 'username, email and password are required' });

    if (users.find(u => u.email === email))
        return res.status(409).json({ error: 'Email already exists' });

    if (users.find(u => u.username === username))
        return res.status(409).json({ error: 'Username already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: nextUserId++,
        firstName: firstName || '',
        lastName:  lastName  || '',
        username,
        email,
        password: hashedPassword,
        role: 'user',
        verified: false   // simulate email verification
    };

    users.push(newUser);
    res.status(201).json({ message: 'User registered successfully. Please verify your email.', email });
});

// Simulate email verification
app.post('/api/verify-email', (req, res) => {
    const { email } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.verified = true;
    res.json({ message: 'Email verified successfully' });
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    // Allow login with email OR username
    const user = users.find(u => u.username === username || u.email === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.verified) return res.status(403).json({ error: 'Email not verified' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
        { id: user.id, username: user.username, email: user.email, role: user.role },
        SECRET_KEY,
        { expiresIn: '1h' }
    );

    res.json({
        token,
        user: { id: user.id, firstName: user.firstName, lastName: user.lastName,
                username: user.username, email: user.email, role: user.role }
    });
});

// Get own profile  (protected)
app.get('/api/profile', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password, ...safe } = user;
    res.json(safe);
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// Accounts CRUD
app.get('/api/admin/accounts', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json(users.map(({ password, ...u }) => u));
});

app.post('/api/admin/accounts', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const { firstName, lastName, username, email, password, role, verified } = req.body;
    if (!username || !password || !email)
        return res.status(400).json({ error: 'username, email and password required' });
    if (users.find(u => u.email === email))
        return res.status(409).json({ error: 'Email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = { id: nextUserId++, firstName: firstName||'', lastName: lastName||'',
                      username, email, password: hashed, role: role||'user', verified: !!verified };
    users.push(newUser);
    const { password: _, ...safe } = newUser;
    res.status(201).json(safe);
});

app.put('/api/admin/accounts/:id', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { firstName, lastName, username, email, password, role, verified } = req.body;
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName  !== undefined) user.lastName  = lastName;
    if (username  !== undefined) user.username  = username;
    if (email     !== undefined) user.email     = email;
    if (role      !== undefined) user.role      = role;
    if (verified  !== undefined) user.verified  = verified;
    if (password  && password.trim()) user.password = await bcrypt.hash(password, 10);

    const { password: _, ...safe } = user;
    res.json(safe);
});

app.delete('/api/admin/accounts/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id = parseInt(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'User not found' });
    users.splice(idx, 1);
    res.json({ message: 'Account deleted' });
});

app.post('/api/admin/accounts/:id/reset-password', authenticateToken, authorizeRole('admin'), async (req, res) => {
    const id   = parseInt(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password } = req.body;
    if (!password || password.length < 6)
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    user.password = await bcrypt.hash(password, 10);
    res.json({ message: 'Password reset successfully' });
});

// Departments
app.get('/api/admin/departments', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json(departments);
});

app.post('/api/admin/departments', authenticateToken, authorizeRole('admin'), (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const dept = { id: departments.length + 1, name, description: description || '' };
    departments.push(dept);
    res.status(201).json(dept);
});

app.put('/api/admin/departments/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id   = parseInt(req.params.id);
    const dept = departments.find(d => d.id === id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
    const { name, description } = req.body;
    if (name)        dept.name        = name;
    if (description) dept.description = description;
    res.json(dept);
});

app.delete('/api/admin/departments/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = departments.findIndex(d => d.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Department not found' });
    departments.splice(idx, 1);
    res.json({ message: 'Department deleted' });
});

// Employees
app.get('/api/admin/employees', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json(employees);
});

app.post('/api/admin/employees', authenticateToken, authorizeRole('admin'), (req, res) => {
    const { employeeId, userId, position, deptId, hireDate } = req.body;
    if (!employeeId || !userId || !position || !deptId || !hireDate)
        return res.status(400).json({ error: 'All fields required' });
    const emp = { id: employees.length + 1, employeeId, userId: parseInt(userId),
                  position, deptId: parseInt(deptId), hireDate };
    employees.push(emp);
    res.status(201).json(emp);
});

app.put('/api/admin/employees/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const emp = employees.find(e => e.id === id);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    const { employeeId, userId, position, deptId, hireDate } = req.body;
    if (employeeId) emp.employeeId = employeeId;
    if (userId)     emp.userId     = parseInt(userId);
    if (position)   emp.position   = position;
    if (deptId)     emp.deptId     = parseInt(deptId);
    if (hireDate)   emp.hireDate   = hireDate;
    res.json(emp);
});

app.delete('/api/admin/employees/:id', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = employees.findIndex(e => e.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Employee not found' });
    employees.splice(idx, 1);
    res.json({ message: 'Employee deleted' });
});

// Requests
app.get('/api/requests', authenticateToken, (req, res) => {
    if (req.user.role === 'admin') return res.json(requests);
    res.json(requests.filter(r => r.userId === req.user.id));
});

app.post('/api/requests', authenticateToken, (req, res) => {
    const { type, items } = req.body;
    if (!type || !items || items.length === 0)
        return res.status(400).json({ error: 'type and items required' });
    const req2 = { id: requests.length + 1, userId: req.user.id,
                   employeeEmail: req.user.email, type, items,
                   status: 'Pending', date: new Date().toISOString() };
    requests.push(req2);
    res.status(201).json(req2);
});

app.put('/api/admin/requests/:id/status', authenticateToken, authorizeRole('admin'), (req, res) => {
    const id  = parseInt(req.params.id);
    const req2 = requests.find(r => r.id === id);
    if (!req2) return res.status(404).json({ error: 'Request not found' });
    req2.status = req.body.status;
    res.json(req2);
});

app.delete('/api/requests/:id', authenticateToken, (req, res) => {
    const id  = parseInt(req.params.id);
    const idx = requests.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Request not found' });
    if (req.user.role !== 'admin' && requests[idx].userId !== req.user.id)
        return res.status(403).json({ error: 'Access denied' });
    requests.splice(idx, 1);
    res.json({ message: 'Request deleted' });
});

// Public content
app.get('/api/content/guest', (req, res) => {
    res.json({ message: 'Public content for all visitors' });
});

// Admin dashboard
app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req, res) => {
    res.json({
        message: 'Welcome to admin dashboard!',
        stats: {
            users:       users.length,
            departments: departments.length,
            employees:   employees.length,
            requests:    requests.length
        }
    });
});

// Start
app.listen(PORT, () => {
    console.log(`✅ Backend running on http://localhost:${PORT}`);
    console.log(`🔐 Admin:  username=admin  password=admin123`);
    console.log(`👤 User:   username=alice  password=user123`);
});