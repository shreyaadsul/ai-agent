import axios from 'axios';

// Test if the webhook endpoint is receiving POST requests
async function testWebhook() {
  console.log('Testing webhook endpoint...\n');
  
  // Test 1: Check if server is running
  try {
    const healthCheck = await axios.get('http://localhost:3000/');
    console.log('✅ Server is running');
    console.log('   Response:', healthCheck.data);
  } catch (error) {
    console.error('❌ Server is NOT running or not accessible');
    console.error('   Error:', error.message);
    return;
  }
  
  console.log('');
  
  // Test 2: Test POST endpoint
  try {
    const testResponse = await axios.post(
      'http://localhost:3000/attendance_callbackurl/test',
      { test: 'data', timestamp: new Date().toISOString() },
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('✅ POST endpoint is working');
    console.log('   Response:', testResponse.data);
  } catch (error) {
    console.error('❌ POST endpoint is NOT working');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
  
  console.log('');
  
  // Test 3: Simulate a WhatsApp webhook message
  try {
    const mockWebhook = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '1234567890',
              phone_number_id: 'PHONE_NUMBER_ID'
            },
            messages: [{
              from: '919876543210',
              id: 'wamid.test123',
              timestamp: Math.floor(Date.now() / 1000),
              type: 'text',
              text: {
                body: 'Hi'
              }
            }]
          },
          field: 'messages'
        }]
      }]
    };
    
    const webhookResponse = await axios.post(
      'http://localhost:3000/attendance_callbackurl',
      mockWebhook,
      { headers: { 'Content-Type': 'application/json' } }
    );
    console.log('✅ Webhook endpoint accepted mock message');
    console.log('   Status:', webhookResponse.status);
  } catch (error) {
    console.error('❌ Webhook endpoint rejected mock message');
    console.error('   Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('Next steps:');
  console.log('1. Check your server console for [WEBHOOK] logs');
  console.log('2. Check ngrok logs for incoming POST requests');
  console.log('3. Verify webhook in Meta Dashboard');
  console.log('4. Make sure access token is valid in .env file');
  console.log('='.repeat(60));
}

testWebhook();

