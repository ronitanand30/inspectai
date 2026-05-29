import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// PDF upload + text extraction endpoint
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const data = await pdfParse(req.file.buffer);
    const text = data.text?.trim();
    if (!text || text.length < 50) {
      return res.status(422).json({ error: 'Could not extract text from this PDF. Please paste the report text manually.' });
    }
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
});

// AI analysis endpoint — API key never leaves this server
app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server not configured. Add ANTHROPIC_API_KEY to environment.' });
  }

  const { messages, system } = req.body;
  if (!messages) return res.status(400).json({ error: 'Missing messages' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages,
        ...(system && { system })
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('\n') || '';
    res.json({ text });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`InspectAI running on http://localhost:${PORT}`);
});
