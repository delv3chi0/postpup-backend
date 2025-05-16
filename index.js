require('dotenv').config();
console.log('✅ .env loaded, JWT_SECRET is:', process.env.JWT_SECRET);

const express = require('express');
const cors    = require('cors'); // Import the cors middleware
const mongoose = require('mongoose');
const bcrypt    = require('bcryptjs');
const Bull      = require('bull');
const jwt       = require('jsonwebtoken');
const { OpenAI } = require('openai');
const { Schema, model } = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Init Express
const app = express();

// Middleware - Essential for request handling
const corsOptions = {
  origin: 'https://postpup-frontend.vercel.app', // Only allow requests from your Vercel frontend
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // If you need to handle cookies or authorization headers
};
app.use(cors(corsOptions)); // Use the cors middleware with options
app.use(express.json());

// 🖐 Ping endpoint - Useful for health checks
app.get('/ping', (req, res) => {
  console.log('🔔  /ping hit');
  res.send('pong');
});

// Define User model

// — Scheduling queue (only in production) —
const isProd = process.env.NODE_ENV === 'production';
let scheduleQueue;
if (isProd) {
  const redisUrl = process.env.REDIS_URL;
  console.log('ℹ️ REDIS_URL in production:', redisUrl); // Keep this line

  scheduleQueue = new Bull('scheduleQueue', redisUrl, {
    redis: { tls: {} } // Still provide TLS options within the redis object
  });
  scheduleQueue.on('error', error => console.error('🚨 Bull Queue Error:', error));
  scheduleQueue.process(async job => {
    console.log('🕒 Running job:', job.id, job.data);
    // TODO: load draft, post, record results - Implement your posting logic here
  });
  console.log('⚙️ Bull queue initialized for production.');
} else {
  console.log('⚠️ Skipping scheduling queue in development.');
}

// — Auth routes —
// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // --- Server-side validation ---
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // --- Check for existing user ---
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // --- Hash the password ---
    const hash = await bcrypt.hash(password, 10);

    // --- Create the new user ---
    const user = await User.create({ email, passwordHash: hash });

    // --- Respond to the frontend ---
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token, message: 'User registered successfully!' }); // 201 Created
  } catch (error) {
    console.error('❌ Error during signup:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Added expiration
    res.json({ token });
  } catch (error) {
    console.error('❌ Error during login:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// — AI caption route —
app.post('/api/generate-caption', async (req, res) => {
  try {
    const { draftText, tone, platform } = req.body;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `${tone} caption for ${platform}: ${draftText}`;
    const response = await openai.completions.create({
      model: 'text-davinci-003',
      prompt,
      max_tokens: 60
    });
    res.json({ caption: response.choices[0].text.trim() });
  } catch (error) {
    console.error('❌ Error generating caption:', error);
    res.status(500).json({ error: 'Failed to generate caption' });
  }
});

// — Schedule post endpoint —
app.post('/api/schedule-post', async (req, res) => {
  try {
    const { draftId, dateTimeUTC, timeZone, repeatRule } = req.body;
    if (isProd && scheduleQueue) {
      const job = await scheduleQueue.add(
        { draftId, dateTimeUTC, timeZone },
        { repeat: { cron: repeatRule } }
      );
      res.json({ jobId: job.id, status: 'scheduled' });
    } else {
      console.log('⚠️ Scheduling skipped (not in production):', { draftId, dateTimeUTC, timeZone, repeatRule });
      res.json({ status: 'development-skipped', requestBody: { draftId, dateTimeUTC, timeZone, repeatRule } });
    }
  } catch (error) {
    console.error('❌ Error in /api/schedule-post:', error);
    res.status(500).json({ error: 'Failed to schedule post' });
  }
});

// — Analytics stub —
app.get('/api/analytics', (_req, res) => {
  console.log('📊  /api/analytics hit');
  res.json({ data: [] });
});

// Start server & graceful shutdown
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐶 Backend running at http://localhost:${PORT}`);
});

async function gracefulShutdown() {
  console.log('Gracefully shutting down server...');
  try {
    await server.close();
    await mongoose.disconnect();
    if (scheduleQueue) {
      await scheduleQueue.close(); // Close Bull connection as well
      console.log('Bull queue connection closed.');
    }
    console.log('Server and MongoDB connections closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);


app.post('/api/signup', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const newUser = new User({ email, password, firstName, lastName });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

const bcrypt = require('bcrypt');

// Handle user signup
app.post('/api/signup', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(409).json({ error: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, firstName, lastName });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
