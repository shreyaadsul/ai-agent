import crypto from 'crypto';
import express from 'express';
import nunjucks from 'nunjucks';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import axios from 'axios';
import moment from 'moment-timezone';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import { exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Employee, Employer, Attendance } from './models/index.js';

import whatsappRouter from './routes/whatsappRouter.js';

import { sendImage } from './utils/messages.js';
import { uploadFileToBucket } from './utils/bucket.js';
import {
  delay,
  deleteFile,
  formatTime12h,
  generateCheckInStatus,
  generateCheckOutStatus,
} from './utils/utils.js';
import { browserAttendanceController } from './controllers/whatsappMessageController.js';

const app = express();

nunjucks.configure('./', {
  autoescape: true,
});

app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WhatsApp Attendance Bot Server is running',
    timestamp: new Date().toISOString(),
    webhookEndpoint: '/attendance_callbackurl',
    webhookOverrideEndpoint: '/attendance_callbackurl/webhook-override'
  });
});

const origins = [
  'https://whatsapp-bot-template.glitch.me',
  'https://uninvective-incorrigibly-warren.ngrok-free.dev ',
  'https://chatwithpdf.in',
  'https://www.chatwithpdf.in',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'https://autowhat-attendance-checkin.vercel.app',
  //'https://henkel-shipment-tracking.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Check if the origin is in the allowedOrigins array
    if (origins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors());

app.get('/attendance_callbackurl/debug-sentry', function mainHandler() {
  // try {
  throwError();
  // } catch (e) {
  //   console.error(e.message)
  //   throw new Error("My first Sentry error!");
  // }
});

function throwError() {
  throw new Error('This is a simulated error');
}

app.post(
  '/attendance_callbackurl/upload-attendance-photo',
  browserAttendanceController
);

// Log all requests to webhook endpoint
app.use('/attendance_callbackurl', (req, res, next) => {
  console.log(`[REQUEST] ${req.method} /attendance_callbackurl${req.path} at ${new Date().toISOString()}`);
  if (req.method === 'POST') {
    console.log(`[REQUEST] POST body keys:`, Object.keys(req.body || {}));
  }
  next();
}, whatsappRouter);

// Handle typo in webhook URL
app.use('/attandance_callbackurl', (req, res, next) => {
  console.log(`[REQUEST] (TYPO) ${req.method} /attandance_callbackurl${req.path} at ${new Date().toISOString()}`);
  next();
}, whatsappRouter);

app.get('/attendance_callbackurl/employers', async (req, res) => {
  try {
    const employers = await Employer.find({});

    return res.status(200).json({ status: 'success', data: employers });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/attendance_callbackurl/employees/:company_id', async (req, res) => {
  try {
    const companyId = req.params.company_id;

    if (!companyId) {
      return res.status(400).json({
        status: 'failed',
        message: 'company id is required to get all employees',
      });
    }

    const employees = await Employee.aggregate([
      {
        $match: {
          companyId,
        },
      },
      {
        $lookup: {
          from: 'attendances',
          let: { id_str: { $toString: '$_id' } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$employeeId', '$$id_str'],
                },
              },
            },
          ],
          as: 'attendance',
        },
      },
      {
        $addFields: {
          lastAttendance: { $arrayElemAt: ['$attendance.checkInTime', -1] },
        },
      },
    ]);

    res.status(200).json({ status: 'success', data: employees });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/attendance_callbackurl/attendances', async (req, res) => {
  try {
    const companyId = req.query.company_id;

    if (!companyId) {
      return res.status(400).json({
        status: 'failed',
        message: 'company id is required to get all employees',
      });
    }

    const attendances = await Attendance.find({ companyId });
    res.status(200).json({ status: 'success', data: attendances });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ status: 'error', message: 'Internal Server Error' });
  }
});

app.get('/click-photo/:employeeId/:attendanceType', async (req, res) => {
  const { employeeId, attendanceType } = req.params;

  res.sendFile(path.join(__dirname, 'public', 'attendance-photo.html'), {
    headers: {
      'Content-Type': 'text/html',
    },
    query: { employeeId, attendanceType },
  });
});

app.get('/attendance_callbackurl/search', async (req, res) => {
  const input = req.query.input;

  if (!input) {
    return res.status(400).json({ error: 'Input parameter is required' });
  }

  try {
    // Construct the curl command
    const curlCommand = `curl -s -w "%{http_code}" -o response.json "https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      input
    )}&format=json&countrycodes=IN&limit=5"`;

    // Execute the curl command
    exec(curlCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Error executing curl command:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      if (stderr) {
        console.error('Curl stderr:', stderr);
        return res.status(500).json({ error: 'Error with curl execution' });
      }

      // Check the response status code
      const httpCode = stdout.slice(-3); // Last 3 characters contain HTTP status code
      const responseBodyPath = 'response.json';

      if (httpCode === '200') {
        // Check if the response file exists and is not empty
        if (
          fs.existsSync(responseBodyPath) &&
          fs.statSync(responseBodyPath).size > 0
        ) {
          try {
            // Read the JSON response from the file
            const responseData = JSON.parse(
              fs.readFileSync(responseBodyPath, 'utf8')
            );
            return res.json(responseData);
          } catch (jsonError) {
            console.error('Error parsing JSON response:', jsonError);
            return res
              .status(500)
              .json({ error: 'Error parsing JSON response' });
          }
        } else {
          return res
            .status(404)
            .json({ error: 'Received empty or invalid response body' });
        }
      } else {
        return res.status(500).json({ error: `HTTP Error: ${httpCode}` });
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0zEV2u/PovbsWn4noi9prcsww8zXXG4OiERW3reIPVt753XW
ZMb2NYDNvTRp2fxCNN3caZmBpoJe5erUehIwhJJMd04yey0yzvIrVHe+iluNWJ13
6G8JDl80ivtDgoxxE4x8HVXLyC2sWhPzurL1Xk1je74C1k46H9j9LZi0NRkHy3cA
ABIcXI8GzFTLdkWD2MOkv8OTNB49WqUUCm1JPC3lLgrXAxFyUuCZQfkFEg9bWxyp
nQ8RuG+f00iUXR/w7JBBQ1+4EKBN1tQSpYeKM8QhgKwc8IGF7QyNEjiw/scYGO1A
1Djv8pMBasvYsVD+oWX9rnb1fbMhlEjYIfU74wIDAQABAoIBAGM/yyST1MGiR1sT
tG6M1548QlOSHZerhRrW+vg5ykYDi0wwXawIsMZeHNIRIrm1yitsJFxgLsTgudZV
MLuZdsGmu1bKIgEvMZR9zI0qpRoCgn+lqSdLnzbo2RmDkat1cuKb/+wNWPJfPIMs
ozsXRSanOdx6ZHzwUHKNGBZokC/vE+VSydHbeUy3Txi4+75ZMTOCL/r/hur0hWoG
Sv7c/5sDWGhRFFV1CD/03pESn8Gu4qQW20eyai+WeebeIUjlV802chPdrn8ztIMb
Tn7K1mcrkPQlty3YJMS3KJt0idE5fzsw3KmANbJc4xjhN/FPNHz45Xk7O0g4qNmA
39g+LWECgYEA6UuMyFjsCLBWJMOj7b5Wa/JgpGAmS98Lnl501buvLi1xtYIIPmPh
78Ki7EaGu5YpVvx4lPQFd6HZaZu/KZLxYmtsprxA6MShOwKd4/yor9srgkxm1z53
AA2UrNbcN14TmKmi886dv5BsuhOCzgPXWEITKZiXGg2mRGId2z1OsnMCgYEA577W
zKoSdZYGMrwHbmbo1pQpXt7f4hBQBLXr7V9svG0CflsQcmHhwQtl8VtbRcyaLzOQ
cd2yQKSqdsXnW43BzBVH8wwuICxVnrqlRD63OmpmkPW50d87BKPH2/RVly3Aop0Q
PBiCN94iV+I5swYN9Bq0g+P/MGHUN6uXX3a1RNECgYEAjcq1Ti99hepm8QFXaO/+
Zq1xv3YQ0JxH24FdUWo5Fr/YFJFroT/j2m1ZyHE1Al5J0eyw/RczG3rrQRzAGuyM
eV0BNHXGnbKkq9DzVdYCUJ/M2ezFtJzqhsW6TzJntd8f2fGAcN5rUjrdWlrxbXU4
NRQzwVxUuikBnR5lNxMT+bECgYEAyYeMBC9iHh95BGW/kKKtmOz/jSEEUPMeovoR
UTvKs5GYuYk3pEC6scXXwSxRE0H6U1HkKyFAAjcwhllT+Kot/ewDxbix5Aip7H8j
eVWQwZwF1cna7kfSaxaClyTDydRf0QoFND2cADmMZCC3TJfXSpBuqsN7B/gLNN5j
pQD2YgECgYBjVaVDh+9BEIwGG5SC1eUPA3SbAW7zTJsDlH5ZjCR+0m0qP+lXQ8RK
E3Ikd/ani5LFtSUwzOjEdOkELuGlaEVByZnhiu0aY26OQRc0GCUTiaCkrOhy+WQI
MRzMRdDBDtp3suYiqov3yMMsEoudujLEAP/Uw+Fb3QejAsZpZx7kGg==
-----END RSA PRIVATE KEY-----
`;

const decryptRequest = (body, privatePem) => {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;

  // Decrypt the AES key created by the client
  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: crypto.createPrivateKey(privatePem),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  // Decrypt the Flow data
  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

  const TAG_LENGTH = 16;
  const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv(
    'aes-128-gcm',
    decryptedAesKey,
    initialVectorBuffer
  );
  decipher.setAuthTag(encryptedFlowDataTag);

  const decryptedJSONString = Buffer.concat([
    decipher.update(encryptedFlowDataBody),
    decipher.final(),
  ]).toString('utf-8');

  return {
    decryptedBody: JSON.parse(decryptedJSONString),
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
};

const encryptResponse = (response, aesKeyBuffer, initialVectorBuffer) => {
  // Flip the initialization vector
  const flipped_iv = [];
  for (const pair of initialVectorBuffer.entries()) {
    flipped_iv.push(~pair[1]);
  }
  // Encrypt the response data
  const cipher = crypto.createCipheriv(
    'aes-128-gcm',
    aesKeyBuffer,
    Buffer.from(flipped_iv)
  );
  return Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
};

const downloadFile = async (url, filePath) => {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream', // Stream the file instead of loading the entire response into memory
    });

    const file = fs.createWriteStream(filePath);

    // Pipe the stream directly to the file
    response.data.pipe(file);

    return new Promise((resolve, reject) => {
      file.on('finish', () => {
        file.close(() => resolve(filePath));
      });
      file.on('error', (err) => {
        fs.unlink(filePath, () => reject(err.message));
      });
    });
  } catch (error) {
    throw new Error(`Failed to download file: ${error.message}`);
  }
};

const runWorker = (workerData) => {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./workers/decrypt-flow-media.js', {
      workerData,
    });

    worker.on('message', (message) => {
      if (message.error) {
        reject(new Error(message.error));
      } else {
        resolve(message.decryptedMedia);
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
};

app.post('/attendance_callbackurl/manual-punching', async (req, res) => {
  try {
    const { decryptedBody, aesKeyBuffer, initialVectorBuffer } = decryptRequest(
      req.body,
      PRIVATE_KEY
    );

    const { version, action } = decryptedBody;

    if (action === 'ping') {
      const response = {
        version: '3.0',
        data: {
          status: 'active',
        },
      };

      const encryptedResponse = encryptResponse(
        response,
        aesKeyBuffer,
        initialVectorBuffer
      );

      return res.send(encryptedResponse);
    }

    if (decryptedBody.data.type === 'manual_checkin') {
      const data = decryptedBody.data;

      const payload = {};

      // Loop through the data object
      for (const key in data) {
        // Check if the key starts with 'employee'
        if (key.startsWith('employee')) {
          // Assign the key-value pair to the new object
          payload[key] = data[key];
        }
      }

      const response = {
        version,
        screen: data.nextScreen,
        data: {
          ...payload,
          companyId: data.companyId,
          timeZone: data.timeZone,
        },
      };

      try {
        const filePath = `${new Date().getTime()}.enc`;

        const imageData = data.images[0];
        // Step 1: Download the file
        await downloadFile(imageData.cdn_url, filePath);

        // Read the downloaded file
        const cdnFile = await fsPromises.readFile(filePath);

        const ciphertext = cdnFile.slice(0, -10); // The file minus the last 10 bytes
        const hmac10 = cdnFile.slice(-10); // The last 10 bytes (HMAC)

        const encData = imageData.encryption_metadata;

        const encryptionKey = encData.encryption_key;
        const hmacKey = encData.hmac_key;
        const iv = encData.iv;
        const plaintextHash = encData.plaintext_hash;
        const encryptedHash = encData.encrypted_hash;

        // Step 2: Offload decryption to the worker thread
        const decryptedMedia = await runWorker({
          ciphertext,
          encryptionKey,
          hmacKey,
          iv,
          hmac10,
          plaintextHash,
          encryptedHash,
          cdnFile,
        });

        // Step 3: Save the decrypted media
        await fsPromises.writeFile(imageData.file_name, decryptedMedia);

        const checkInTime = new Date();
        // Split the time string into hours and minutes
        const [hours, minutes] = data.checkInTime.split(':').map(Number);
        // Set the hours and minutes of the current date
        checkInTime.setHours(hours, minutes, 0, 0);

        const date = moment.tz(
          new Date(
            checkInTime.getFullYear(),
            checkInTime.getMonth(),
            checkInTime.getDate()
          ),
          data.timeZone
        );

        // const [employeeId] = data.employeeId.split("_@_");

        const bucketRes = await uploadFileToBucket(
          `${process.env.ROOT_PATH}/${imageData.file_name}`,
          imageData.file_name
        );

        if (bucketRes) {
          const url = bucketRes.url;

          const [id, name] = data.employeeId.split('_@_');

          const resp = await Attendance.create({
            employeeId: id,
            companyId: data.companyId,
            checkInTime,
            date,
            checkInPic: url,
            status: data.checkInStatus,
          });

          if (resp) {
            response.data[
              'checkInResponseText'
            ] = `✅️ Check In Succces - ${name}`;
            const encryptedResponse = encryptResponse(
              response,
              aesKeyBuffer,
              initialVectorBuffer
            );

            res.send(encryptedResponse);

            const ownerNumbers = data.ownerNumbers?.split('_@_');

            const message = `A quick update to let you know that ${name} has checked in at ${formatTime12h(
              checkInTime
            )}.`;

            if (ownerNumbers && ownerNumbers.length > 0) {
              for (const ownerNumber of ownerNumbers) {
                await delay(300);

                await sendImage({
                  recipientPhone: ownerNumber,
                  url,
                  caption: message,
                });
              }
            }

            return;
          }

          deleteFile(imageData.file_name);
          deleteFile(filePath);
        }

        const [, name] = data.employeeId.split('_@_');
        response.data['checkInResponseText'] = `❌ Check In Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        return res.send(encryptedResponse);
      } catch (error) {
        const [, name] = data.employeeId.split('_@_');
        response.data['checkInResponseText'] = `❌ Check In Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        res.send(encryptedResponse);

        console.error('Error:', error);
      }
    } else if (decryptedBody.data.type === 'manual_punching') {
      let response;

      const { employee1, employee2, employee3, employee4 } =
        decryptedBody.data || {};

      const [employeeId, employeeName, attendanceStatus] = (
        employee1 ||
        employee2 ||
        employee3 ||
        employee4
      ).split('_@_');

      if (attendanceStatus === '') {
        response = {
          version,
          screen: 'MANUAL_PUNCHING_IN',
          data: {
            ...decryptedBody.data,
            employeeId: `${employeeId}:${employeeName}:${attendanceStatus}`,
            employeeName,
            companyId: decryptedBody.data.companyId,
            timeZone: decryptedBody.data.timeZone,
            attendanceType: 'in',
            timeLabel: 'Select Check In Time',
            photoLabel: 'Upload Check In Photo',
            checkInResponseText: '',
          },
        };
      } else {
        response = {
          version,
          screen: 'MANUAL_PUNCHING_OUT',
          data: {
            ...decryptedBody.data,
            employeeId: `${employeeId}:${employeeName}:${attendanceStatus}`,
            employeeName,
            companyId: decryptedBody.data.companyId,
            timeZone: decryptedBody.data.timeZone,
            attendanceType: 'out',
            timeLabel: 'Check Out Time',
            photoLabel: 'Upload Check Out Photo',
            checkInResponseText: '',
          },
        };
      }

      const encryptedResponse = encryptResponse(
        response,
        aesKeyBuffer,
        initialVectorBuffer
      );

      return res.send(encryptedResponse);
    } else if (decryptedBody.data.type === 'in') {
      const data = decryptedBody.data;

      const response = {
        version,
        screen: 'Screen_Eight',
        data: {
          companyId: data.companyId,
          timeZone: data.timeZone,
        },
      };

      try {
        const filePath = `${new Date().getTime()}.enc`;

        const imageData = data.images[0];
        // Step 1: Download the file
        await downloadFile(imageData.cdn_url, filePath);

        // Read the downloaded file
        const cdnFile = await fsPromises.readFile(filePath);

        const ciphertext = cdnFile.slice(0, -10); // The file minus the last 10 bytes
        const hmac10 = cdnFile.slice(-10); // The last 10 bytes (HMAC)

        const encData = imageData.encryption_metadata;

        const encryptionKey = encData.encryption_key;
        const hmacKey = encData.hmac_key;
        const iv = encData.iv;
        const plaintextHash = encData.plaintext_hash;
        const encryptedHash = encData.encrypted_hash;

        // Step 2: Offload decryption to the worker thread
        const decryptedMedia = await runWorker({
          ciphertext,
          encryptionKey,
          hmacKey,
          iv,
          hmac10,
          plaintextHash,
          encryptedHash,
          cdnFile,
        });

        // Step 3: Save the decrypted media
        await fsPromises.writeFile(imageData.file_name, decryptedMedia);

        const checkInTime = new Date();
        // Split the time string into hours and minutes
        const [hours, minutes] = data.checkTime.split(':').map(Number);
        // Set the hours and minutes of the current date
        checkInTime.setHours(hours, minutes, 0, 0);

        const date = moment.tz(
          new Date(
            checkInTime.getFullYear(),
            checkInTime.getMonth(),
            checkInTime.getDate()
          ),
          data.timeZone
        );

        const bucketRes = await uploadFileToBucket(
          `${process.env.ROOT_PATH}/${imageData.file_name}`,
          imageData.file_name
        );

        if (bucketRes) {
          const url = bucketRes.url;

          const [id, name] = data.employeeId.split(':');

          const employee = await Employee.findById(id);

          const checkInData = {
            employeeId: id,
            companyId: data.companyId,
            checkInTime,
            date,
            checkInPic: url,
          };

          if (employee.natureOfTime === 'Fixed') {
            let status = '';

            status = generateCheckInStatus(checkInTime, {
              timeZone: employee.timeZone,
              checkIn: employee.checkIn,
            });

            checkInData.status = status[1];
            data.name += ` ${status[0]}`;
          } else if (employee.natureOfTime === 'Flexible') {
            checkInData.status = 'onTime';
          }

          const resp = await Attendance.create(checkInData);

          if (resp) {
            response.data['responseText'] = `✅️ Check In Succces - ${name}`;
            const encryptedResponse = encryptResponse(
              response,
              aesKeyBuffer,
              initialVectorBuffer
            );

            res.send(encryptedResponse);

            // const ownerNumbers = data.ownerNumbers?.split('_@_');

            // const message = `A quick update to let you know that ${name} has checked in at ${formatTime12h(
            //   checkInTime
            // )}.`;

            // if (ownerNumbers && ownerNumbers.length > 0) {
            //   for (const ownerNumber of ownerNumbers) {
            //     await delay(300);

            //     await sendImage({
            //       recipientPhone: ownerNumber,
            //       url,
            //       caption: message,
            //     });
            //   }
            // }

            return;
          }

          deleteFile(imageData.file_name);
          deleteFile(filePath);
        }

        const [, name] = data.employeeId.split(':');

        response.data['checkInResponseText'] = `❌ Check In Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        return res.send(encryptedResponse);
      } catch (error) {
        const [, name] = data.employeeId.split('_@_');
        response.data['checkInResponseText'] = `❌ Check In Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        res.send(encryptedResponse);

        console.error('Error:', error);
      }
    } else if (decryptedBody.data.type === 'out') {
      const data = decryptedBody.data;

      const response = {
        version,
        screen: 'Screen_Eight',
        data: {
          companyId: data.companyId,
          timeZone: data.timeZone,
        },
      };

      try {
        const filePath = `${new Date().getTime()}.enc`;

        const imageData = data.images[0];
        // Step 1: Download the file
        await downloadFile(imageData.cdn_url, filePath);

        // Read the downloaded file
        const cdnFile = await fsPromises.readFile(filePath);

        const ciphertext = cdnFile.slice(0, -10); // The file minus the last 10 bytes
        const hmac10 = cdnFile.slice(-10); // The last 10 bytes (HMAC)

        const encData = imageData.encryption_metadata;

        const encryptionKey = encData.encryption_key;
        const hmacKey = encData.hmac_key;
        const iv = encData.iv;
        const plaintextHash = encData.plaintext_hash;
        const encryptedHash = encData.encrypted_hash;

        // Step 2: Offload decryption to the worker thread
        const decryptedMedia = await runWorker({
          ciphertext,
          encryptionKey,
          hmacKey,
          iv,
          hmac10,
          plaintextHash,
          encryptedHash,
          cdnFile,
        });

        // Step 3: Save the decrypted media
        await fsPromises.writeFile(imageData.file_name, decryptedMedia);

        const checkOutTime = new Date();
        // Split the time string into hours and minutes
        const [hours, minutes] = data.checkTime.split(':').map(Number);
        // Set the hours and minutes of the current date
        checkOutTime.setHours(hours, minutes, 0, 0);

        const bucketRes = await uploadFileToBucket(
          `${process.env.ROOT_PATH}/${imageData.file_name}`,
          imageData.file_name
        );

        if (bucketRes) {
          const url = bucketRes.url;

          const [id, name] = data.employeeId.split(':');

          let attendance = await Attendance.findAttendance(id, data.companyId);

          const employee = await Employee.findById(id);

          const { status, timeSpent } = generateCheckOutStatus(
            moment.tz(checkOutTime, employee.timeZone),
            attendance,
            {
              checkOut: moment.tz(employee.checkOut, employee.timeZone),
              timeZone: employee.timeZone,
              requiredHours: moment.tz(
                employee.requiredHours,
                employee.timeZone
              ),
              natureOfTime: employee.natureOfTime,
            }
          );

          const resp = await Attendance.updateOne(
            { _id: attendance._id.toString() },
            {
              checkOutTime: checkOutTime,
              checkOutCoords: [],
              checkOutPic: url ?? 'none',
              timeSpent,
              status: status[1],
            }
          );

          if (resp) {
            response.data['responseText'] = `✅️ Check Out Succces - ${name}`;
            const encryptedResponse = encryptResponse(
              response,
              aesKeyBuffer,
              initialVectorBuffer
            );

            res.send(encryptedResponse);

            // const ownerNumbers = data.ownerNumbers?.split('_@_');

            // const message = `A quick update to let you know that ${name} has checked in at ${formatTime12h(
            //   checkInTime
            // )}.`;

            // if (ownerNumbers && ownerNumbers.length > 0) {
            //   for (const ownerNumber of ownerNumbers) {
            //     await delay(300);

            //     await sendImage({
            //       recipientPhone: ownerNumber,
            //       url,
            //       caption: message,
            //     });
            //   }
            // }

            return;
          }

          deleteFile(imageData.file_name);
          deleteFile(filePath);
        }

        const [, name] = data.employeeId.split(':');

        response.data['responseText'] = `❌ Check Out Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        return res.send(encryptedResponse);
      } catch (error) {
        const [, name] = data.employeeId.split('_@_');
        response.data['responseText'] = `❌ Check Out Failed - ${name}`;

        const encryptedResponse = encryptResponse(
          response,
          aesKeyBuffer,
          initialVectorBuffer
        );

        res.send(encryptedResponse);

        console.error('Error:', error);
      }
    }
  } catch (e) {
    console.error(e);
  }
});

export default app;
