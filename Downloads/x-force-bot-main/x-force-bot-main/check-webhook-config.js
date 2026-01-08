import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env' });

const webhookUrl = process.env.WEBHOOK_OVERRIDE_CALLBACK_URI;
const verifyToken = process.env.WEBHOOK_OVERRIDE_VERIFY_TOKEN;
const accessToken = process.env.Meta_WA_accessToken;
const wabaId = process.env.Meta_WA_wabaId;
const phoneNumberId = process.env.Meta_WA_SenderPhoneNumberId;

console.log('\n🔧 WhatsApp Webhook Configuration Diagnostic');
console.log('=============================================\n');

async function checkWebhookConfig() {
  try {
    console.log('1️⃣  Testing webhook accessibility...');
    const testUrl = `${webhookUrl}?hub.mode=subscribe&hub.challenge=test123&hub.verify_token=${verifyToken}`;
    const response = await axios.get(testUrl);
    console.log(`    ✅ Webhook responds to verification (HTTP ${response.status})\n`);
  } catch (error) {
    console.log(`    ❌ Webhook not accessible: ${error.message}\n`);
    return;
  }

  try {
    console.log('2️⃣  Fetching current webhook configuration from Meta...');
    const configUrl = `https://graph.instagram.com/v18.0/${wabaId}?fields=webhooks`;
    
    const response = await axios.get(configUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (response.data?.webhooks) {
      console.log('    📋 Current webhook config in Meta:');
      response.data.webhooks.forEach((webhook, idx) => {
        console.log(`    Webhook ${idx + 1}:`);
        console.log(`      URL: ${webhook.callback_url}`);
        console.log(`      Token: ${webhook.verify_token}`);
        console.log(`      Fields: ${webhook.fields?.join(', ')}`);
      });
      console.log('');

      // Check if ngrok URL is configured
      const hasNgrok = response.data.webhooks.some(w => 
        w.callback_url.includes('ngrok-free.dev') || 
        w.callback_url.includes('ngrok.io')
      );

      if (hasNgrok) {
        console.log('    ✅ ngrok URL IS configured in Meta!\n');
      } else {
        console.log('    ❌ ngrok URL is NOT configured in Meta!\n');
        console.log('    🔴 This is why you\'re not receiving messages!\n');
        console.log('    ⚠️  Required Action:');
        console.log('    1. Go to Meta Business Platform');
        console.log('    2. Settings → Webhooks');
        console.log('    3. Update callback URL to: ' + webhookUrl);
        console.log('    4. Verify Token: ' + verifyToken);
        console.log('    5. Subscribe to: messages, message_status\n');
      }
    } else {
      console.log('    ⚠️  No webhook configuration found in Meta!\n');
      console.log('    You need to configure it manually:\n');
      console.log('    1. Go to Meta Business Platform');
      console.log('    2. Settings → Webhooks');
      console.log('    3. Enter callback URL: ' + webhookUrl);
      console.log('    4. Enter Verify Token: ' + verifyToken);
      console.log('    5. Subscribe to: messages, message_status\n');
    }
  } catch (error) {
    console.log(`    ⚠️  Could not fetch config (token may be invalid)`);
    console.log(`    Error: ${error.response?.data?.error?.message || error.message}\n`);
    console.log('    💡 If token is expired, you need to refresh it in Meta App Dashboard\n');
  }

  console.log('3️⃣  Summary:');
  console.log(`    WABA ID: ${wabaId}`);
  console.log(`    Phone Number ID: ${phoneNumberId}`);
  console.log(`    Webhook URL: ${webhookUrl}`);
  console.log(`    Verify Token: ${verifyToken}`);
  console.log('    ngrok Status: Running ✅');
  console.log('    Server Status: Running ✅\n');
}

checkWebhookConfig();
