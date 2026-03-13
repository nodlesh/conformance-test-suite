// Quick debug script to test the server directly
const express = require('express');
const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy-debug', timestamp: new Date().toISOString() });
});

app.post('/api/run', (req, res) => {
  console.log('Received run request with body:', req.body);
  res.json({ message: 'Debug server received request' });
});

app.listen(5006, () => {
  console.log('Debug server running on port 5006');
});
