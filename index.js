require('dotenv').config();
console.log('✅ .env loaded, JWT_SECRET is:', process.env.JWT_SECRET);

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Bull = require('bull');
const jwt = require('jsonwebtoken');
const { OpenAI } = require('openai');
const { Schema, model } = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const app = express();

const corsOptions = {
  origin: "*",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.get('/ping', (req, res) => {
  console.log('🔔  /ping hit');
  res.send('pong');
});

const isProd = process.env.NODE_ENV === 'production';
let scheduleQueue;
if (isProd) {
  const redisUrl = process.env.REDIS_URL;
  console.log('ℹ️ REDIS_URL in production:', redisUrl);

  scheduleQueue = new Bull('scheduleQueue', redisUrl, {
    redis: { tls: {} }
  });
  scheduleQueue.on('error', error => console.error('🚨 Bull Queue Error:', error));
  scheduleQueue.process(async job => {
    console.log('🕒 Running job:', job.id, job.data);
  });
  console.log('⚙️ Bull queue initialized for production.');
} else {
  console.log('⚠️ Skipping scheduling queue in development.');
}

app.post('/api/signup', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
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

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('❌ Error during login:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

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

app.get('/api/analytics', (_req, res) => {
  console.log('📊  /api/analytics hit');
  res.json({ data: [] });
});

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
      await scheduleQueue.close();
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
