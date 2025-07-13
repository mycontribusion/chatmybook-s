// server.js

// Import necessary modules
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Initialize the Express application
const app = express();
const port = process.env.PORT || 5000;

let poetryBookContent = ''; // Variable to store the poetry book content

// --- File System Read for poetry_book.txt ---
fs.readFile(path.join(__dirname, 'data', 'poetry_book.txt'), 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading poetry_book.txt:', err);
        console.error('CRITICAL: poetry_book.txt could not be loaded. Chatbot will not function correctly.');
        process.exit(1); // Exit if the essential 'book' content cannot be loaded
    }
    poetryBookContent = data;
    console.log('poetry_book.txt loaded successfully.');
});

// --- Middleware Setup ---
app.use(cors());
app.use(express.json());

// --- API Endpoint for Chatbot Interaction ---
app.post('/api/chat', async (req, res) => {
    const userQuery = req.body.query;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query is required in the request body.' });
    }

    if (!poetryBookContent) {
        console.error('Attempted AI query before poetry book content was loaded.');
        return res.status(500).json({ error: 'Poetry book content not loaded on server. Please try again in a moment or check server logs.' });
    }

    // --- Construct the Prompt for the AI ---
    // Instructions for AI to discuss poetry and generate relevant buttons.
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

    // --- Prepare Payload for Gemini API ---
    const payload = {
        contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
        generationConfig: {
            temperature: 0.5, // Slightly higher temperature for more creative/interpretive responses for poetry
            topP: 0.9,
            topK: 40,
            maxOutputTokens: 1000,
        }
    };

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
        console.error('GEMINI_API_KEY is not set in environment variables. Please check your .env file.');
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
            console.error(`Gemini API returned an error status: ${response.status} ${response.statusText}`);
            console.error('Gemini API Error Body:', errorText);
            return res.status(500).json({ error: `Gemini API error: ${response.statusText || 'Unknown error'}. See server logs for details.` });
        }

        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const aiResponseText = result.candidates[0].content.parts[0].text;
            res.json({ response: aiResponseText });
        } else {
            console.error('Unexpected AI response structure. No candidates or content found:', JSON.stringify(result, null, 2));
            res.status(500).json({ error: "Failed to get a valid response from the AI. Unexpected structure." });
        }
    } catch (error) {
        console.error("Error calling Gemini API from backend:", error);
        if (error.cause && error.cause.code === 'ETIMEDOUT') {
            res.status(500).json({ error: "Network timeout when connecting to AI. Check server's internet or firewall." });
        } else {
            res.status(500).json({ error: "Backend server error during AI interaction. Please check server logs." });
        }
    }
});

// --- Serve Static React Files in Production ---
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../frontend/build')));
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
    });
}

// --- Start the Server ---
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Access backend at http://localhost:${port}`);
    if (process.env.NODE_ENV !== 'production') {
        console.log('Ensure your React app is configured to proxy API requests to this server.');
    }
});
