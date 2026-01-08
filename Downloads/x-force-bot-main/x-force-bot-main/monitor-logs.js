import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

console.log('🔍 Webhook Log Monitor');
console.log('======================\n');
console.log('Waiting for webhook events...');
console.log('Send a message or click "other" option now!\n');
console.log('Real-time logs:\n');
console.log('======================\n');

// This will run alongside the server
// Just check the server logs in the running terminal
