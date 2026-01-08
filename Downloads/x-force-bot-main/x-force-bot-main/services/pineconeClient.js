
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Pinecone Client
// Assumes PINECONE_API_KEY and PINECONE_INDEX_NAME are in .env
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});

const indexName = 'attendance-memory'; // As specified in requirements
const index = pinecone.index(indexName);

export default index;
