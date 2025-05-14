const express = require('express');
const cors = require('cors');

const app = express();

console.log("🟡 Starting Express app setup...");

// ✅ Update: Support both local and deployed frontend
const allowedOrigins = [
  'http://localhost:5200',
  'https://postpup-frontend.vercel.app'  // update this if your final Vercel URL changes
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

console.log("✅ Middleware registered");

// POST route for testing login
app.post('/api/login', (req, res) => {
  console.log("➡️ Received POST /api/login");
  console.log("Request body:", req.body);

  const { email, password } = req.body;

  if (email && password) {
    console.log("✅ Login accepted");
    return res.json({ message: 'Login successful!' });
  }

  console.log("❌ Missing credentials");
  return res.status(400).json({ message: 'Missing email or password.' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Welcome to the PostPup API');
});
