const webhookConnectionController = async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Use environment variable for verify token, fallback to '123'
    const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN || '123';

    console.log('\n' + '='.repeat(60));
    console.log('[WEBHOOK VERIFY] GET request received');
    console.log(`[WEBHOOK VERIFY] Mode: ${mode || 'undefined'}`);
    console.log(`[WEBHOOK VERIFY] Token received: ${token || 'undefined'}`);
    console.log(`[WEBHOOK VERIFY] Expected token: ${expectedToken}`);
    console.log(`[WEBHOOK VERIFY] Challenge: ${challenge || 'undefined'}`);
    console.log(`[WEBHOOK VERIFY] Full query:`, req.query);

    if (mode && token && mode === 'subscribe' && token === expectedToken) {
      console.log('✅ Webhook verification successful - sending challenge');
      console.log('='.repeat(60) + '\n');
      return res.status(200).send(challenge);
    } else {
      console.log('❌ Webhook verification failed');
      if (!mode) console.log('   - Missing hub.mode parameter');
      if (!token) console.log('   - Missing hub.verify_token parameter');
      if (mode !== 'subscribe') console.log(`   - Mode is "${mode}" but expected "subscribe"`);
      if (token !== expectedToken) console.log(`   - Token mismatch: received "${token}" but expected "${expectedToken}"`);
      console.log('='.repeat(60) + '\n');
      return res.sendStatus(403);
    }
  } catch (error) {
    console.error('[WEBHOOK VERIFY ERROR]', error);
    return res.sendStatus(500);
  }
};

export default webhookConnectionController;
