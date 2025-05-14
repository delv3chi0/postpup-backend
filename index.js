const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'password') {
    return res.json({ message: 'Login successful' });
  }
  res.status(401).json({ message: 'Invalid credentials' });
});

app.listen(5000, () => {
  console.log('🐶 Backend running at http://localhost:5000');
});
