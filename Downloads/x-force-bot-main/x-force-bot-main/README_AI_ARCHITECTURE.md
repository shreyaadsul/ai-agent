
# AI Agent & Semantic Memory Architecture

## Overview
This document outlines the architecture for the WhatsApp Attendance Bot's AI agent, focusing on the separation of concerns between MongoDB (Source of Truth) and Pinecone (Semantic Memory).

## 1. Data Architecture & Schema

### A. MongoDB (Source of Truth)
MongoDB is the **primary** database. It stores all business-critical data, including employee records, raw attendance logs, and official status.

**Employee Schema (`models/employeeModel.js`)**
(Refer to existing file for full schema)
- `_id`: Unique Identifier
- `employeeNumber`: Phone Number (Key)
- `companyId`: Tenant ID
- `role`: Permission level

**Attendance Schema (`models/attendanceModel.js`)**
(Refer to existing file)
- `employeeId`: Link to Employee
- `date`: Date of record
- `logs`: Array of interaction logs
  - `time`: Timestamp
  - `log`: **Raw text message** (e.g., "I am late due to traffic")
- `status`: Approved status (late, onTime, absent)

**Why MongoDB?**
- Relational integrity (Employee -> Attendance).
- Data consistency and durability.
- Structured querying (e.g., "Find all late records for Employee X").


### B. Pinecone (Semantic Memory)
Pinecone acts as the **Long-Term Semantic Memory**. It allows the agent to "remember" the *meaning* of past interactions without querying the entire database.

**Vector Schema**
- **Index Name**: `attendance-memory`
- **Dimension**: 1204 (Google Gemini `text-embedding-004`) with reduced dimensionality)
- **Metric**: Cosine Similarity

**Metadata Design**
Each vector is stored with the following metadata for filtering:
```json
{
  "employeeId": "65a...",       // link to MongoDB _id
  "companyId": "65b...",        // tenant isolation
  "date": "2023-10-27T...",     // timestamp
  "type": "attendance_excuse",  // type of memory
  "rawText": "I'm stuck in traffic" // Human-readable snippet
}
```

**Why Pinecone?**
- Enables **Semantic Search**: Finding "Traffic jam" matches "Stuck on highway" even if words differ.
- Fast similarity search across history.
- **No Business Logic**: We do *not* store "Status: Late" in Pinecone. That belongs in MongoDB. Pinecone only knows "This text is similar to previous texts."

---

## 2. Agent Decision Flow

### WhatsApp Webhook Flow (High Level)

1. **Receive Message**: Webhook at `controllers/whatsappMessageController.js` receives POST from Meta.
2. **Text Handler**: `msgHandlers/textMsgHandler.js` is invoked.
3. **AI Interception**: 
   - `handleAttendanceWithAI` (`services/agentDecisionEngine.js`) is called.
   - **Step 1**: Identify Employee from MongoDB.
   - **Step 2**: **Write to MongoDB** (Log the message). Source of truth updated first.
   - **Step 3**: Generate Embedding (Google Gemini `text-embedding-004`).
   - **Step 4**: **Read from Pinecone**. Query specific to `employeeId` to find past similar excuses.
   - **Step 5**: **Decision Logic**:
     - *0 Matches*: Acknowledge.
     - *1-2 Matches*: Warning (suggest alternatives).
     - *3+ Matches*: **Escalate**. Call `escalateToManager` (MongoDB write to `Issues` collection).
   - **Step 6**: **Write to Pinecone**. Upsert the NEW embedding for future memory.
   - **Step 7**: Reply to user.

## 3. Key Design Decisions

- **Stateless Agent**: The agent relies on DB state, making it scalable.
- **Strict Isolation**: 
  - MongoDB = Compliance, Payroll, Auditing.
  - Pinecone = Context, Personalization, Pattern Recognition.
- **Escalation Loop**: System automatically creates Tickets in MongoDB `issues` collection, which can trigger notifications to Managers (already supported by existing notification logic).
