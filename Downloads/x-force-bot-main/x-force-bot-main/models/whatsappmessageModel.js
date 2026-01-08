import mongoose from "mongoose";

const { Schema } = mongoose;

const WhatsAppnMessageSchema = new Schema(
  { data: Schema.Types.Mixed }
  // Add more options or configurations if needed
);

// Create the Task model
const WhatsAppnMessage = mongoose.model("WhatsAppnMessage", WhatsAppnMessageSchema);
export default WhatsAppnMessage;
