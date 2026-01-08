import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Test the webhook override endpoint
async function testWebhookOverride() {
  try {
    const overrideCallbackUri = process.env.WEBHOOK_OVERRIDE_CALLBACK_URI || 'https://uninvective-incorrigibly-warren.ngrok-free.dev/attendance_callbackurl';
    const verifyToken = process.env.WEBHOOK_OVERRIDE_VERIFY_TOKEN || '123';
    
    console.log('Testing webhook override with:');
    console.log('  Callback URI:', overrideCallbackUri);
    console.log('  Verify Token:', verifyToken);
    console.log('');

    const response = await axios.post(
      'http://localhost:3000/attendance_callbackurl/webhook-override',
      {
        override_callback_uri: overrideCallbackUri,
        verify_token: verifyToken
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Success!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Error:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Message:', error.message);
    }
  }
}

testWebhookOverride();

