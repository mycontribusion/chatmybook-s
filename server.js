// server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

let poetryBookContent = '';

fs.readFile(path.join(__dirname, 'data', 'poetry_book.txt'), 'utf8', (err, data) => {
  if (err) {
        console.error('Error reading poetry_book.txt:', err);
        process.exit(1);
    }
  poetryBookContent = data;
  console.log('poetry_book.txt loaded successfully.');
});

// --- FIXED CORS ---
const allowedOrigins = [
  'https://chatwithmypoetrybook.netlify.app',
  'http://localhost:3000'
];

const corsOptions = {
    origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow origin: ${origin}`), false);
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ✅ Handle preflight requests

app.use(express.json());

app.post('/api/chat', async (req, res) => {
    const userQuery = req.body.query;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query is required in the request body.' });
    }

    if (!poetryBookContent) {
    return res.status(500).json({ error: 'Poetry book content not loaded on server.' });
    }

    const promptInstructions = `
Based *only* on the following poetry book content, discuss the user's query.
Focus on themes, imagery, poetic style, or specific poems/stanzas as they appear in the text.
Provide any relevant information found, even if it's not a complete direct answer. Do not use external information.

--- POETRY BOOK CONTENT START ---
${poetryBookContent}
--- POETRY BOOK CONTENT END ---

If your response discusses a specific poem or a clearly defined section/theme (e.g., headings like '## Poem 1: Echoes of Dawn' or '## Themes Explored'), please list these *exact* titles or headings at the end of your response.
Prefix these with "BUTTONS: " and separate them with commas. For example: "BUTTONS: Poem 1: Echoes of Dawn, Themes Explored".
Only suggest buttons for topics that can be directly queried and fully answered from the *exact phrases* found in the document. Do not invent new topics for buttons.`;

    const finalPrompt = `${promptInstructions}\n\nUser's query: "${userQuery}"`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        generationConfig: {
            temperature: 0.5,
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 1000,
        }
    };

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
    return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(500).json({ error: 'Gemini API error. See server logs for details.' });
        }

        const result = await response.json();
    const aiResponseText =
      result.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI.";

            res.json({ response: aiResponseText });
    } catch (error) {
    console.error("Error calling Gemini API:", error);
    res.status(500).json({ error: "Error communicating with Gemini AI." });
    }
});

// Serve static files from React frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
    });
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
