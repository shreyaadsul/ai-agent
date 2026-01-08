
import index from './pineconeClient.js';
import { generateEmbedding } from './embeddingService.js';
import { saveAttendanceLog, escalateToManager } from './attendanceService.js';
import Employee from '../models/employeeModel.js';

/**
 * Main Agent Decision Engine.
 * Orchestrates: Message -> MongoDB -> Embedding -> Pinecone Query -> Decision -> Pinecone Upsert
 * 
 * @param {string} message - The incoming text message.
 * @param {string} recipientPhone - The user's phone number.
 * @param {string} companyId - The company ID.
 * @returns {Promise<Object>} - Result containing response text and action type.
 */
export async function handleAttendanceWithAI(message, recipientPhone, companyId) {
    console.log(`[AI AGENT] Processing message from ${recipientPhone}: "${message}"`);

    // 1. Identify Employee
    const employee = await Employee.findOne({ employeeNumber: Number(recipientPhone), companyId });
    if (!employee) {
        console.error(`[AI AGENT] Employee not found for ${recipientPhone}`);
        return { action: 'error', text: "Employee record not found." };
    }
    const employeeId = employee._id.toString();

    // 2. Save structured data to MongoDB (Source of Truth)
    // We assume this message is related to attendance (e.g. check-in note, late excuse)
    // We update the log but don't change status blindly without more context, 
    // though for "late reasons" we might assume they are already marked late or absent.
    await saveAttendanceLog(employeeId, companyId, message, null);

    // 3. Generate Embedding for the new message
    const vector = await generateEmbedding(message);

    // 4. Query Pinecone for Semantic Similarity
    // Filter by employeeId to enable "Personalized Semantic Memory"
    const queryResponse = await index.query({
        vector: vector,
        topK: 10,
        filter: { employeeId: employeeId },
        includeMetadata: true
    });

    // Filter matches with high similarity score (e.g. > 0.85) indicating same "Excuse" or "Reason"
    const matches = queryResponse.matches || [];
    const similarExcuses = matches.filter(match => match.score > 0.82);

    console.log(`[AI AGENT] Found ${similarExcuses.length} semantically similar past messages.`);

    // 5. Decision Logic
    let responseText = "";
    let action = "reply";

    if (similarExcuses.length === 0) {
        // Case A: First-time issue or unique message
        responseText = "Thank you. Your message has been noted.";
    } else if (similarExcuses.length < 3) {
        // Case B: Repeated semantic excuse (warning)
        // Suggest alternative behavior
        responseText = "I noticed you've mentioned this before. Please try to plan ahead to avoid this issue.";
    } else {
        // Case C: Frequent repetition (3+ similar excuses)
        const isPersistent = similarExcuses.length >= 5;

        if (isPersistent) {
            // Case D: Persistent pattern -> Manager
            await escalateToManager(
                employeeId,
                companyId,
                `Persistent excuse pattern detected. User said: "${message}". Similar to ${similarExcuses.length} past messages.`,
                'high'
            );
            responseText = "This pattern of attendance issues has been flagged to your Manager.";
            action = "escalate_manager";
        } else {
            // Case C cont.: 3-4 times -> Team Lead
            await escalateToManager(
                employeeId,
                companyId,
                `Repeated excuse detected. User said: "${message}". Similar to ${similarExcuses.length} past messages.`,
                'medium'
            );
            responseText = "This issue has been escalated to your Team Lead due to repetition.";
            action = "escalate_lead";
        }
    }

    // 6. Upsert new embedding to Pinecone (Semantic Memory)
    // We store this AFTER analyzing, so it becomes part of history for NEXT time.
    // Metadata: employeeId, date, type, rawText
    // NO business state (like payroll) is stored here.
    await index.upsert([{
        id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        values: vector,
        metadata: {
            employeeId,
            date: new Date().toISOString(),
            rawText: message, // Storing raw text for context retrieval if needed
            type: 'attendance_log'
        }
    }]);

    console.log(`[AI AGENT] Decision: ${action}, Response: "${responseText}"`);
    return { action, text: responseText };
}
