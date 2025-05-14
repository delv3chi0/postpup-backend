require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mongoose = require('mongoose');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { OpenAI } = require('openai');
const Bull      = require('bull');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Init Express
const app = express();
app.use(cors());
app.use(express.json());

// 🖐 Ping endpoint
app.get('/ping', (req, res) => {
  console.log('🔔  /ping hit');
  res.send('pong');
});

// Setup OpenAI & Queue
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const scheduleQueue = new Bull('scheduleQueue', process.env.REDIS_URL);

// Define User model
const { Schema, model } = require('mongoose');
const User = model('User', new Schema({
  email: String,
  passwordHash: String
}));

// — Auth routes —
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash: hash });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// — AI caption route —
app.post('/api/generate-caption', async (req, res) => {
  const { draftText, tone, platform } = req.body;
  const prompt = `${tone} caption for ${platform}: ${draftText}`;
  const response = await openai.completions.create({
    model: 'text-davinci-003', prompt, max_tokens: 60
  });
  res.json({ caption: response.choices[0].text.trim() });
});

// — Schedule post —
app.post('/api/schedule-post', async (req, res) => {
  const { draftId, dateTimeUTC, timeZone, repeatRule } = req.body;
  const job = await scheduleQueue.add(
    { draftId, dateTimeUTC, timeZone },
    { repeat: { cron: repeatRule } }
  );
  res.json({ jobId: job.id, status: 'scheduled' });
});

// — Analytics stub —
app.get('/api/analytics', (_req, res) => {
  console.log('📊  /api/analytics hit');
  res.json({ data: [] });
});

// — Queue processor —
scheduleQueue.process(async (job) => {
  console.log('🕒 Running job:', job.id, job.data);
  // TODO: load draft, post, record results
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐶 Backend running at http://localhost:\${PORT}`);
});
