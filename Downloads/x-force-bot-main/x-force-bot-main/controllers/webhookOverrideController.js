import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const webhookOverrideController = async (req, res) => {
  try {
    // Get override_callback_uri from request body or use environment variable as fallback
    const override_callback_uri = req.body.override_callback_uri || process.env.WEBHOOK_OVERRIDE_CALLBACK_URI;
    const verify_token = req.body.verify_token || process.env.WEBHOOK_OVERRIDE_VERIFY_TOKEN;

    // Validate required fields
    if (!override_callback_uri || !verify_token) {
      return res.status(400).json({
        status: 'error',
        message: 'Both override_callback_uri and verify_token are required. Provide them in request body or set WEBHOOK_OVERRIDE_CALLBACK_URI and WEBHOOK_OVERRIDE_VERIFY_TOKEN in .env',
      });
    }

    // Get WABA_ID from environment variables
    const WABA_ID = process.env.Meta_WA_wabaId;
    const ACCESS_TOKEN = process.env.Meta_WA_accessToken;
    console.log("Check this ", WABA_ID, ACCESS_TOKEN);
    if (!WABA_ID || !ACCESS_TOKEN) {
      return res.status(500).json({
        status: 'error',
        message: 'WABA_ID or ACCESS_TOKEN not configured',
      });
    }

    // Meta Graph API endpoint for webhook override
    const apiUrl = `https://graph.facebook.com/v18.0/${WABA_ID}/subscribed_apps`;

    // Make POST request to Meta API
    const response = await axios.post(
      apiUrl,
      {
        override_callback_uri,
        verify_token,
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return res.status(200).json({
      status: 'success',
      message: 'Webhook override callback URI set successfully',
      data: response.data,
    });
  } catch (error) {
    console.error('Error setting webhook override:', error);
    
    // Handle specific error responses from Meta API
    if (error.response) {
      return res.status(error.response.status || 500).json({
        status: 'error',
        message: error.response.data?.error?.message || 'Failed to set webhook override',
        error: error.response.data,
      });
    }

    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message,
    });
  }
};

export default webhookOverrideController;

