
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config();

// Ensure API key is present
if (!process.env.GOOGLE_API_KEY) {
    console.error("ERROR: GOOGLE_API_KEY is missing in environment variables.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

/**
 * Generates vector embedding for the given text using Google Gemini.
 * Model: text-embedding-004
 * @param {string} text - The text to embed.
 * @returns {Promise<number[]>} - The embedding vector.
 */
export async function generateEmbedding(text) {
    try {
        if (!text || typeof text !== 'string') {
            throw new Error("Invalid text input for embedding");
        }

        // Google Gemini Embedding Request
        const result = await model.embedContent({
            content: { parts: [{ text }] },
            outputDimensionality: 1024 // Enforce dimension to match Pinecone
        });

        const embedding = result.embedding;
        const values = embedding.values;

        // Safety Check for dimension mismatch
        if (values.length !== 1024) {
            console.warn(`[WARNING] Generated embedding dimension ${values.length} does not match expected 1024.`);
        }

        return values;
    } catch (error) {
        console.error('Error generating Gemini embedding:', error.message);
        throw error;
    }
}
