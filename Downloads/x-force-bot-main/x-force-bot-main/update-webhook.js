import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Update webhook override with correct URL
async function updateWebhook() {
  try {
    const overrideCallbackUri = 'https://uninvective-incorrigibly-warren.ngrok-free.dev/attendance_callbackurl';
    const verifyToken = '123';
    
    console.log('Updating webhook override...');
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
    
    console.log('✅ Webhook override updated successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    console.log('');
    console.log('='.repeat(60));
    console.log('Next steps:');
    console.log('1. Go to Meta Dashboard → WhatsApp → Configuration');
    console.log('2. Update Callback URL to:', overrideCallbackUri);
    console.log('3. Update Verify Token to:', verifyToken);
    console.log('4. Click "Verify and save"');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error updating webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Message:', error.message);
    }
  }
}

updateWebhook();

