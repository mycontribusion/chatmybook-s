// server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

let poetryBookContent = '';

// --- Read Poetry Book Content Asynchronously ---
(async () => {
    try {
        const data = await fs.promises.readFile(path.join(__dirname, 'data', 'poetry_book.txt'), 'utf8');
        poetryBookContent = data.trim(); // Trim extra whitespace
        console.log('poetry_book.txt loaded successfully.');
    } catch (err) {
        console.error('Error reading poetry_book.txt:', err);
        console.error('CRITICAL: poetry_book.txt could not be loaded.');
        process.exit(1);
    }
})();

// --- CORS Setup ---
const allowedOrigins = [
    'https://chatithmypoetrybook.netlify.app',
    'http://localhost:3000',
];

const corsOptions = {
    origin: function (origin, callback) {
        console.log('CORS request from origin:', origin);
        if (!origin) return callback(null, true); // Allow non-browser tools
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        const msg = `CORS policy: Access from origin ${origin} not allowed.`;
        console.error(msg);
        return callback(new Error(msg), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.use(express.json());

// --- Explicit Preflight Handler ---
app.options('/api/chat', cors(corsOptions));

// --- Chat Endpoint ---
app.post('/api/chat', async (req, res) => {
    const userQuery = req.body.query;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query is required in the request body.' });
    }

    if (!poetryBookContent) {
        console.error('Poetry content not yet loaded.');
        return res.status(500).json({ error: 'Poetry book not loaded yet. Try again shortly.' });
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
        console.error('GEMINI_API_KEY is missing.');
        return res.status(500).json({ error: 'Server configuration error: Missing API key.' });
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
            console.error(`Gemini API error: ${response.status} ${response.statusText}`);
            console.error('Response body:', errorText);
            return res.status(500).json({ error: `Gemini API error: ${response.statusText}` });
        }

        const result = await response.json();

        if (
            result.candidates &&
            result.candidates[0]?.content?.parts?.[0]?.text
        ) {
            const aiResponseText = result.candidates[0].content.parts[0].text;
            res.json({ response: aiResponseText });
        } else {
            console.error('Unexpected AI response structure:', result);
            res.status(500).json({ error: "Invalid AI response structure." });
        }
    } catch (error) {
        console.error('Gemini API call failed:', error);
        res.status(500).json({ error: "Server error during AI call." });
    }
});

// --- React Build Serving ---
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
    });
}

// --- Health Check (optional) ---
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', poetryLoaded: !!poetryBookContent });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    if (process.env.RENDER) {
        console.log('Running on Render platform.');
    } else {
        console.log(`Access at http://localhost:${port}`);
    }
});
