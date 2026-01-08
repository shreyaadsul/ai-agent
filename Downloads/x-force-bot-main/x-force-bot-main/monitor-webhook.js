import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const webhookUrl = process.env.WEBHOOK_OVERRIDE_CALLBACK_URI;
const verifyToken = process.env.WEBHOOK_OVERRIDE_VERIFY_TOKEN;
const accessToken = process.env.Meta_WA_accessToken;
const wabaId = process.env.Meta_WA_wabaId;

console.log('\n🔍 WhatsApp Webhook Status Monitor');
console.log('=====================================\n');

console.log('📍 Configuration:');
console.log(`   Webhook URL: ${webhookUrl}`);
console.log(`   Verify Token: ${verifyToken}`);
console.log(`   WABA ID: ${wabaId}`);
console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);

console.log('\n⏳ Waiting for WhatsApp messages...');
console.log('Send a test message to your WhatsApp bot now!');
console.log('\n📝 Real-time log events:');
console.log('=====================================\n');

// This script just shows the configuration
// The actual webhook logs are in the running server.js
console.log('✅ To see webhook messages in real-time:');
console.log('   1. Keep this terminal open');
console.log('   2. Send a WhatsApp message to your bot');
console.log('   3. Check the server terminal for [WEBHOOK] logs');
console.log('\nIf you don\'t see [WEBHOOK] entries after 10 seconds:');
console.log('   → The webhook URL in Meta is NOT configured correctly');
console.log('   → Update it to: ' + webhookUrl);
console.log('\n=====================================');

// Keep the process alive
setInterval(() => {}, 1000);
