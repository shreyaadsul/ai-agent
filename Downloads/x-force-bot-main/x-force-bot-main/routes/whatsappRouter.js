import { Router } from 'express';

import path from 'path';

import webhookConnectionController from '../controllers/webhookConnectionController.js';
import { whatsappMessageController } from '../controllers/whatsappMessageController.js';
import webhookOverrideController from '../controllers/webhookOverrideController.js';
import {
  oneDayLeaveController,
  manyDayLeaveController,
  editEmployeeController,
} from '../controllers/flowController.js';

const router = Router();

router
  .route('/')
  .get(webhookConnectionController)
  .post((req, res, next) => {
    if (req.body.encrypted_flow_data) {
      console.log('[ROUTER] 🔀 Redirecting root flow request to oneDayLeaveController');
      return oneDayLeaveController(req, res, next);
    }
    return whatsappMessageController(req, res, next);
  });

router.post('/flow/one-day-leave', oneDayLeaveController);
router.post('/flow/many-day-leave', manyDayLeaveController);
router.post('/flow/edit-employee', editEmployeeController);


router.get('/click-photo/:employeeNumber/:attendanceType', (req, res) => {
  const { employeeNumber, attendanceType } = req.params;

  res.sendFile(
    path.join(process.env.ROOT_PATH, 'public', 'attendance-photo.html'),
    {
      headers: {
        'Content-Type': 'text/html',
      },
      query: { employeeNumber, attendanceType },
    }
  );
});

// Webhook override endpoint for Meta
router.post('/webhook-override', webhookOverrideController);

// Test endpoint to verify POST is working
router.post('/test', (req, res) => {
  console.log('[TEST] POST /test received');
  console.log('[TEST] Body:', JSON.stringify(req.body, null, 2));
  res.json({
    status: 'success',
    message: 'POST endpoint is working!',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// router.post("/upload-attendance-photo", (req, res) => {
// });

export default router;
