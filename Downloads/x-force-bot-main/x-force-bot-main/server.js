import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendFileSync } from 'fs';

dotenv.config({ path: '.env' });

import app from './app.js';
import Employee from './models/employeeModel.js';
import { sendEmployeeDemoTemplate } from './utils/messages.js';

(async () => {
  addRootPathInEnv();

  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/attendance_prod";

  mongoose.connect(mongoUrl, {}).then(async () => {
    console.log('Connected to MongoDB');
  }).catch((error) => {
    console.error('MongoDB connection error:', error.message);
    console.log('Server will continue to run, but database features may not work.');
    console.log('Please check your MongoDB credentials and connection string.');
  });
})();

const port = process.env.PORT || 3000;

app.listen(port, () =>
  console.log(`App now running and listening on port ${port}`)
);

function addRootPathInEnv() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  if (!process.env.ROOT_PATH) {
    appendFileSync(
      './.env',
      `\nROOT_PATH=${path.join(
        path.dirname(__dirname),
        path.basename(__dirname)
      )}\n`
    );
    process.exit(1);
  }
}