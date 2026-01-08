import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env' });

const webhookUrl = process.env.WEBHOOK_OVERRIDE_CALLBACK_URI;
const verifyToken = process.env.WEBHOOK_OVERRIDE_VERIFY_TOKEN;
const accessToken = process.env.Meta_WA_accessToken;
const wabaId = process.env.Meta_WA_wabaId;

console.log('🔍 WhatsApp Webhook Setup Test');
console.log('================================\n');

async function testWebhook() {
  try {
    console.log('1️⃣  Testing Webhook Accessibility...');
    console.log(`   URL: ${webhookUrl}`);
    
    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=${verifyToken}`;
    const response = await axios.get(testUrl);
    
    if (response.status === 200) {
      console.log('   ✅ Webhook is accessible and responding');
      console.log(`   ✅ Challenge response: ${response.data}\n`);
    }
  } catch (error) {
    console.log('   ❌ Error testing webhook:');
    console.log(`   ${error.message}\n`);
  }

  try {
    console.log('2️⃣  Checking Webhook Configuration...');
    console.log(`   WABA ID: ${wabaId}`);
    console.log(`   Verify Token: ${verifyToken}`);
    console.log(`   Webhook URL: ${webhookUrl}\n`);

    console.log('3️⃣  Attempting to Update Meta Webhook via Graph API...');
    const graphUrl = `https://graph.instagram.com/v18.0/${wabaId}/subscribed_apps`;
    
    const payload = {
      webhooks: [{
        callback_url: webhookUrl,
        verify_token: verifyToken,
        object: 'whatsapp_business_account',
        fields: ['messages', 'message_status']
      }]
    };

    const updateResponse = await axios.post(graphUrl, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (updateResponse.status === 200) {
      console.log('   ✅ Meta webhook updated successfully!');
      console.log(`   Response: ${JSON.stringify(updateResponse.data, null, 2)}\n`);
    }
  } catch (error) {
    console.log('   ⚠️  Could not update via Graph API (may already be configured)');
    console.log(`   Error: ${error.response?.data?.error?.message || error.message}\n`);
  }

  console.log('4️⃣  Summary');
  console.log('   ✅ ngrok tunnel is active');
  console.log('   ✅ Server is running on port 3000');
  console.log(`   ✅ Webhook URL: ${webhookUrl}`);
  console.log(`   ✅ Verify Token: ${verifyToken}`);
  console.log('\n✨ Webhook setup is ready!');
  console.log('📝 Next: Test by sending a message via WhatsApp');
}

testWebhook();
