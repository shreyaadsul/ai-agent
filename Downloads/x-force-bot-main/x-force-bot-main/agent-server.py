
import os
import json
import logging
import datetime
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify
from pymongo import MongoClient
from pinecone import Pinecone
from neo4j import GraphDatabase
from dotenv import load_dotenv

# LangChain & Gemini
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig

# Load environment variables
load_dotenv()

# Configuration
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "attendance-memory")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "123")

# Admin Phone Numbers (Comma Separated)
ADMIN_PHONE_NUMBER = os.getenv("ADMIN_PHONE_NUMBER", "")
ADMIN_PHONE_NUMBERS = [num.strip() for num in ADMIN_PHONE_NUMBER.split(',') if num.strip()]

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")


# Initialize Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Flask
app = Flask(__name__)

# --- 1. Fact System (MongoDB) ---
class FactSystem:
    def __init__(self, uri):
        try:
            self.client = MongoClient(uri)
            self.db = self.client["human_in_the_loop_db"]
            self.raw_messages = self.db["raw_messages"]
            self.attendance_logs = self.db["attendance_logs"]
            self.employee_records = self.db["employee_records"]
            logger.info("Connected to Fact System (MongoDB).")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")

    def store_raw_message(self, sender_type, sender_id, message, intent_guess=None, confidence=0.0):
        doc = {
            "sender_type": sender_type,
            "sender_id": sender_id,
            "content": message,
            "intent_guess": intent_guess,
            "confidence_score": confidence,
            "timestamp": datetime.datetime.utcnow(),
            "status": "received"
        }
        self.raw_messages.insert_one(doc)

    def get_employee_record(self, employee_id):
        # Mock record if not found
        return self.employee_records.find_one({"employee_id": employee_id}) or {"employee_id": employee_id, "name": "Unknown", "role": "Employee"}

fact_system = FactSystem(MONGO_URI)

# --- 2. Memory System (Pinecone) ---
class MemorySystem:
    def __init__(self, api_key, index_name):
        self.index = None
        if api_key:
            try:
                pc = Pinecone(api_key=api_key)
                if index_name not in [i.name for i in pc.list_indexes()]:
                    pass # Create logic if needed
                self.index = pc.Index(index_name)
                logger.info("Connected to Memory System (Pinecone).")
            except Exception as e:
                logger.error(f"Failed to connect to Pinecone: {e}")

    def search_similar_cases(self, query_text):
        if not self.index:
            return []
        # Implement embedding + search logic here
        return []

memory_system = MemorySystem(PINECONE_API_KEY, PINECONE_INDEX_NAME)

# --- 3. Decision Context Graph (Neo4j) ---
class DecisionContextGraph:
    def __init__(self, uri, user, password):
        self.driver = None
        try:
            self.driver = GraphDatabase.driver(uri, auth=(user, password))
            self.driver.verify_connectivity()
            logger.info("Connected to Decision Context Graph (Neo4j).")
        except Exception as e:
            logger.info(f"Neo4j not detected (Connection refused). Graph features will be disabled. This is normal if Neo4j is not installed.")

    def close(self):
        if self.driver:
            self.driver.close()

    def log_decision_trace(self, employee_id, event_type, reason, approver="AI"):
        if not self.driver: return
        query = """
        MERGE (e:Employee {id: $employee_id})
        MERGE (ev:Event {type: $event_type, reason: $reason})
        MERGE (e)-[:EXPERIENCED]->(ev)
        MERGE (p:Policy {version: 'v3.2'})
        MERGE (ev)-[:EVALUATED_AGAINST]->(p)
        MERGE (d:Decision {approver: $approver, status: 'Approved', timestamp: datetime()})
        MERGE (ev)-[:RESULTED_IN]->(d)
        """
        with self.driver.session() as session:
            session.run(query, employee_id=employee_id, event_type=event_type, reason=reason, approver=approver)

decision_graph = DecisionContextGraph(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD)

# --- Initialize Gemini ---
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0.3,
    google_api_key=GOOGLE_API_KEY,
    convert_system_message_to_human=True
)

# --- 4. Agent Orchestration (Operational Agents) ---

@tool
def compliance_check(action: str):
    """Checks if an action violates company policy."""
    # Logic to query Policy Vectors in Pinecone or Graph
    return "Action complies with Policy v3.2 (Standard Lateness Protocol)."

@tool
def performance_check(employee_id: str):
    """Checks employee performance history."""
    # Logic to check MongoDB/Graph
    return f"Employee {employee_id} has 95% attendance record."

@tool
def escalation_trigger(issue: str, urgency: str):
    """Escalates an issue to the Admin/Manager."""
    return f"Escalated '{issue}' to Admin with urgency: {urgency}."

# --- CEO Agent (Strategic & Reporting) ---
@tool
def strategic_insight(topic: str):
    """Provides high-level strategic insights based on aggregated data."""
    # Logic to aggregate data from Graph/Mongo
    return "Transport disruption is causing 12% average lateness in Plant X."


# --- Agents Configuration ---

from langgraph.prebuilt import create_react_agent

# ... (Previous imports)

# Remove old AgentExecutor imports if they persist and block execution? 
# I will keep the try-except for safety but the code below won't use them.

# ...

# --- Agents Configuration ---

system_prompt_orchestrator = """You are the Lead Orchestrator for the Attendance Bot.
Your role is to coordinate between specialized agents (Compliance, Performance, Escalation) and the human user.
1. Receive input.
2. Gather facts from tools.
3. Check policy compliance.
4. Consult Memory for precedents.
5. If High Confidence (>0.9) -> Automate decision.
6. If Low Confidence -> Ask Admin (Escalate).

Always explain your reasoning clearly (Decision Trace).
"""

tools_orchestrator = [compliance_check, performance_check, escalation_trigger, strategic_insight]

# Replaced legacy AgentExecutor with LangGraph
agent_executor = create_react_agent(llm, tools_orchestrator, prompt=system_prompt_orchestrator)


# --- Core Logic with Step Flow ---

def process_message_flow(sender_type: str, sender_id: str, message: str):
    """
    Implements the 5-Step Flow from the Architecture Plan:
    1. Facts enter MongoDB.
    2. Facts converted to embeddings (simulated here) -> Vector DB.
    3. Decision Graph updated.
    4. Agents query Vector DB -> Graph for decision.
    5. Feedback loop.
    """
    
    # Step 1: Fact Entry
    fact_system.store_raw_message(sender_type, sender_id, message)
    
    # Step 2: Memory Retrieval
    similar_cases = memory_system.search_similar_cases(message)
    context_str = "\n".join(similar_cases) if similar_cases else "No direct precedents found."
    
    # Step 3 & 4: Agent Execution & Decision
    input_text = f"User ({sender_type}:{sender_id}) says: {message}\nContext: {context_str}"
    
    # LangGraph invocation
    result = agent_executor.invoke({"messages": [("human", input_text)]})
    
    # result['messages'] is a list of BaseMessage. The last one is the AI response.
    output_text = result['messages'][-1].content
    
    # Step 5: Decision Logging (Graph)
    # Heuristic to detect if a decision was made
    if "approved" in output_text.lower() or "logged" in output_text.lower():
        decision_graph.log_decision_trace(sender_id, "Interaction", message, approver="AI_Orchestrator")
        
    return output_text

# --- Routes ---

@app.route('/', methods=['GET'])
def home():
    return "AI Agent Server is Running", 200

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy", "service": "Human-in-the-Loop Agent Server (Graph-Enabled)"}), 200

@app.route('/agent/employee', methods=['POST'])
def agent_employee():
    try:
        data = request.json
        # Handle cases where message might be in different fields
        message = data.get('message') or data.get('content')
        sender_id = data.get('sender_id')
        
        if not message:
            return jsonify({"error": "Message is required"}), 400
            
        logger.info(f"Received employee request from {sender_id}: {message}")
        response_text = process_message_flow("employee", sender_id, message)
        return jsonify({"response": response_text})
    except Exception as e:
        logger.error(f"Error in employee agent: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/agent/admin', methods=['POST'])
def agent_admin():
    try:
        data = request.json
        # Handle cases where question/message might be in different fields
        question = data.get('question') or data.get('message')
        sender_id = data.get('sender_id')
        
        if not question:
            return jsonify({"error": "Question is required"}), 400
            
        logger.info(f"Received admin request from {sender_id}: {question}")
        response_text = process_message_flow("admin", sender_id, question)
        return jsonify({"response": response_text})
    except Exception as e:
        logger.error(f"Error in admin agent: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/webhook/whatsapp', methods=['GET', 'POST'])
def webhook_whatsapp():
    if request.method == 'GET':
        mode = request.args.get('hub.mode')
        token = request.args.get('hub.verify_token')
        challenge = request.args.get('hub.challenge')
        if mode == 'subscribe' and token == WHATSAPP_VERIFY_TOKEN:
            return challenge, 200
        return 'Forbidden', 403
            
    if request.method == 'POST':
        try:
            data = request.json
            entry = data['entry'][0]
            changes = entry['changes'][0]
            value = changes['value']
            messages = value.get('messages')
            
            if messages:
                msg = messages[0]
                sender_id = msg['from']
                text = msg['text']['body']
                sender_type = "admin" if sender_id in ADMIN_PHONE_NUMBERS else "employee"
                
                response_text = process_message_flow(sender_type, sender_id, text)
                logger.info(f"Response for {sender_id}: {response_text}")
                
        except Exception as e:
            logger.error(f"Error processing webhook: {e}")
            
        return 'EVENT_RECEIVED', 200

if __name__ == '__main__':
    port = int(os.environ.get("AGENT_PORT", 5000))
    app.run(host='0.0.0.0', port=port)
