require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mongoose = require('mongoose');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { OpenAI } = require('openai');
const Bull      = require('bull');

// 1️⃣ Connect MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// 2️⃣ Init Express
const app = express();
app.use(cors());
app.use(express.json());
app.get('/ping', (req, res) => { console.log('🔔  /ping hit'); res.send('pong'); });

// 3️⃣ Setup OpenAI & Queue
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const scheduleQueue = new Bull('scheduleQueue', process.env.REDIS_URL);

// 4️⃣ Define Models
const { Schema, model } = require('mongoose');
const User = model('User', new Schema({
  email: String,
  passwordHash: String
}));

// 5️⃣ Auth Routes

// Login (example user-check; swap for real DB lookup later)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// Signup
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash: hash });
  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
  res.json({ token });
});

// 6️⃣ AI Caption Route
app.post('/api/generate-caption', async (req, res) => {
  const { draftText, tone, platform } = req.body;
  const prompt = `${tone} caption for ${platform}: ${draftText}`;
  const completion = await openai.createCompletion({
    model: 'text-davinci-003',
    prompt,
    max_tokens: 60
  });
  res.json({ caption: completion.data.choices[0].text.trim() });
});

// 7️⃣ Scheduling Route
app.post('/api/schedule-post', async (req, res) => {
  const { draftId, dateTimeUTC, timeZone, repeatRule } = req.body;
  const job = await scheduleQueue.add(
    { draftId, dateTimeUTC, timeZone },
    { repeat: { cron: repeatRule } }
  );
  res.json({ jobId: job.id, status: 'scheduled' });
});

// 8️⃣ Analytics Stub
app.get('/api/analytics', async (req, res) => {
console.log('📊  /api/analytics hit');
  // TODO: fetch real analytics from Mongo
  res.json({ data: [] });
});

// 9️⃣ Queue Processor
scheduleQueue.process(async (job) => {
  console.log('🕒 Running job:', job.id, job.data);
  // TODO: load draft by job.data.draftId,
  // post it via platform API,
  // and record results in Mongo.
});

// 1️⃣0️⃣ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🐶 Backend running at http://localhost:${PORT}`);
});
