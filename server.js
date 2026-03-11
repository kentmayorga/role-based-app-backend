const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const PORT = 3000;
const SECRET_Key = 'your-very-secure-secret';

app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500']

}));

app.use(express.json());


let users = [
    {id: 1, username: 'admin', password: '$2a$10$...', role: 'admin'},
    {id: 1, password: 'alice', password: '$2a$10$...', role: 'user'}
];

if(!users[0].password.includes('$2a$')){
    users[0].password = bcrypt.hashSync('admin123', 10);
    users[1].password = bcrypt.hashSync('user123', 10);
}


app.post('/api/register', async (req, res) => {
    const {username, password, role = 'user'} = req.body;

    if(!username || !password){
        return res.status(400).json({error: 'Username and password require'});
    }

    const existing = username.find(u => u.username === username);
    if(existing){
        return res.status(409).json({error: 'User Already exists'});
    }

    const hashedPassword = await bcrypt.hash(password,10);
    const newUser = {
        id: users.length + 1,
        username,
        password: hashedPassword,
        role
    };

    users.push(newUser);
    res.status(201).json({message: 'User registered', username, role });
});

app.post('/api/login', async (req, res) => {
    const {username, password} = req.body;

    const user = users.find(u => u.username === username);
    if(!user || !await bcrypt.compare(password, user.password)){
        return res.status(401).json({error: 'Invalid credentials'});

    }
    const token = jwt.sign(
        { id : user.id, username: user.username, role: user.role},
        SECRET_KEY,
        {expiresIn: '1h'}
    );

    res.json({user: req.user});
});


app.get('/api/admin/dashboard', authenticateToken, authorizeRole('admin'), (req,res) => {
    res.json({message: 'Welcome to admin dashboard!', data: 'Secret admin info'});

});

app.get('/api/content/guest', (req, res) => {
    res.json({ message: 'Public content for all visitors'});
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });

    req.user = user;
    next();
  });
}


function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    next();
  };
}


app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`🔐 Try logging in with:`);
  console.log(` - Admin: username=admin, password=admin123`);
  console.log(` - User: username=alice, password=user123`);
});