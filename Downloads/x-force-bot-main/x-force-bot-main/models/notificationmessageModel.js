import mongoose from 'mongoose';

const { Schema } = mongoose;

const NotificationMessageSchema = new Schema(
  { data: Schema.Types.Mixed }
  // Add more options or configurations if needed
);

// Create the Task model
const NotificationMessageLog = mongoose.model(
  'NotificationMessage',
  NotificationMessageSchema
);
export default NotificationMessageLog;
