import os
import time
import uuid
from typing import TypedDict, Annotated, List, Dict, Any, Union
from langgraph.graph import StateGraph, END
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, BaseMessage
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from pinecone import Pinecone, ServerlessSpec

# --- Configuration & Constants ---
INDEX_NAME = "index-autowhat-v1"
EMBEDDING_MODEL = "models/text-embedding-004"
LLM_MODEL = "models/gemini-2.0-flash-exp"

# --- 1. Tool Implementations ---

class VectorMemoryManager:
    """
    Manages interactions with Pinecone for storage and retrieval.
    Strictly uses metadata filtering for employee isolation.
    Refactored to use native pinecone-client to avoid langchain-pinecone dependency issues.
    """
    def __init__(self):
        # We assume keys are set in env by the caller
        self.embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL)
        self.pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
        
        # Ensure index exists (Basic check, usually expected to be pre-created in production)
        existing_indexes = [i.name for i in self.pc.list_indexes()]
        if INDEX_NAME not in existing_indexes:
            print(f"[WARNING] Index '{INDEX_NAME}' not found. Creating it...")
            self.pc.create_index(
                name=INDEX_NAME,
                dimension=768, 
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region="us-east-1") # Example spec
            )
            time.sleep(2) # Wait for initialization

        self.index = self.pc.Index(INDEX_NAME)
        # Debug Index Stats
        try:
            stats = self.index.describe_index_stats()
            print(f"[INFO] Pinecone Index Stats: {stats}")
        except Exception as e:
            print(f"[WARNING] Could not fetch index stats: {e}")

    def execute(self, action: str, employee_id: str, text: str = "") -> Dict[str, Any]:
        """
        Executes memory operations: save or search.
        """
        if action == "save":
            if not text:
                return {"status": "error", "message": "No text to save"}
            
            # Generate embedding
            try:
                vector = self.embeddings.embed_query(text)
            except Exception as e:
                return {"status": "error", "message": f"Embedding failed: {e}"}

            # Add timestamp to metadata for potential temporal logic
            metadata = {
                "employee_id": employee_id, 
                "timestamp": time.time(),
                "text": text
            }
            
            # Upsert to Pinecone
            doc_id = str(uuid.uuid4())
            try:
                self.index.upsert(vectors=[(doc_id, vector, metadata)])
                return {"status": "success", "message": "Memory saved"}
            except Exception as e:
                print(f"[ERROR] Pinecone Upsert Failed: {e}")
                return {"status": "error", "message": f"Upsert failed: {e}"}

        elif action == "search":
            # Search for semantically similar past excuses
            # Filtering STRICTLY by employee_id
            filter_dict = {"employee_id": {"$eq": employee_id}}
            
            # Generate embedding for query
            try:
                query_vector = self.embeddings.embed_query(text)
            except Exception as e:
                return {"status": "error", "message": f"Embedding failed: {e}"}

            # Query Pinecone
            results = self.index.query(
                vector=query_vector,
                top_k=5, # Fetch top 5 to have enough history
                filter=filter_dict,
                include_metadata=True
            )
            
            # Format results for the LLM
            formatted_results = []
            for match in results.get('matches', []):
                formatted_results.append({
                    "content": match['metadata'].get('text', ''),
                    "score": match['score'],
                    "metadata": match['metadata']
                })
            
            return {"status": "success", "matches": formatted_results}
        
        return {"status": "error", "message": "Invalid action"}

def notify_hierarchy(level: str, message: str):
    """
    Stub for WhatsApp notification logic.
    """
    prefix = ""
    if level == "team_leader":
        prefix = "[ALERT - WHATSAPP TO TL]"
    elif level == "manager":
        prefix = "[CRITICAL - WHATSAPP TO MANAGER]"
    else:
        prefix = "[WHATSAPP]"
        
    print(f"\n{prefix}: {message}\n")
    return "Notification sent."

# --- 2. State Definition ---

class AgentState(TypedDict):
    employee_id: str
    current_input: str
    memory_context: List[Dict]
    analysis_decision: str
    response: str
    messages: List[BaseMessage]

# --- 3. LangGraph Nodes ---

# Initialize global tools
# Lazy logic to ensure we don't crash on import if env vars missing, but init happens in node or main
try:
    memory_manager = VectorMemoryManager()
except Exception as e:
    print(f"[WARNING] Memory Manager Init Warning (Ignore if just importing): {e}")
    memory_manager = None

llm = ChatGoogleGenerativeAI(model=LLM_MODEL, temperature=0, google_api_key=os.environ.get("GOOGLE_API_KEY"))

def search_memory_node(state: AgentState):
    """
    Embeds current input and searches Pinecone for history.
    """
    print("--- [SEARCH] SEARCHING MEMORY ---")
    emp_id = state["employee_id"]
    text = state["current_input"]
    
    if not memory_manager:
        return {"memory_context": []}

    result = memory_manager.execute(action="search", employee_id=emp_id, text=text)
    
    if result.get("status") == "error":
        print(f"[ERROR] Search Failed: {result.get('message')}")
    
    matches = result.get("matches", [])
    print(f"[DEBUG] Found {len(matches)} matches. Top scores: {[m.get('score') for m in matches]}")
    return {"memory_context": matches}
    
# ... (reasoning_node stays the same) ...

# ... (escalation_node stays same) ...

def save_memory_node(state: AgentState):
    """
    Saves the current interaction to Pinecone.
    """
    decision = state.get("analysis_decision", "")
    
    # Don't save partial conversations
    if decision in ["ASK_REASON", "ASK_TRANSPORT"]:
        print(f"--- [SAVE] SKIPPING SAVE (Gathering info: {decision}) ---")
        return {}
        
    print("--- [SAVE] SAVING MEMORY ---")
    emp_id = state["employee_id"]
    text = state["current_input"]
    
    if memory_manager:
        # Ideally save accumulated reason, but triggering text is okay for matching
        if "messages" in state:
             # Try to find user messages
             user_msgs = [m.content for m in state["messages"] if isinstance(m, HumanMessage)]
             full_context = " ".join(user_msgs[-3:]) # Last 3 user inputs
             text = full_context
             
        res = memory_manager.execute(action="save", employee_id=emp_id, text=text)
        print(f"[DEBUG] Save Result: {res}")
        if res.get("status") == "error":
            print(f"[ERROR] Save Failed: {res.get('message')}")
    return {}

def reasoning_node(state: AgentState):
    """
    Analyzes current input vs memory context to decide actions.
    """
    print("--- [REASON] REASONING ---")
    memory = state["memory_context"]
    current_text = state["current_input"]
    history = state.get("messages", [])
    
    # Format history for LLM
    history_text = "\n".join([f"{type(m).__name__}: {m.content}" for m in history[-5:]])
    
    # Logic:
    # 1. Check if "Virar" + "Bus" in current AND NOT in memory (First time).
    # 2. Check max similarity score for escalation triggers.
    
    prompt = f"""
    You are an Attendance Manager Agent. 
    Conversation History:
    {history_text}
    
    Current Input: "{current_text}"
    
    Past Memory for this Employee (Top Matches):
    {memory}
    
    Goal: Identify (1) The Reason for lateness, and (2) The Mode of Transport.
    
    Steps:
    1. If this is the START of conversation (or input is just "hi", "check in", "login") and 'Reason' is missing: Output: ASK_REASON | Why are you late?
    2. If the 'Reason' for lateness is NOT in history or input, output: ASK_REASON | Why are you late?
    3. If 'Transport' is NOT in history or input, output: ASK_TRANSPORT | How did you travel?
    4. If BOTH Reason and Transport are clear, apply these Rules:
    
       Rule A: Count semantically similar past excuses (score > 0.60).
       Rule B: If Count < 3: Output: ESCALATE_TL | Reason logged. (If first time & Virar/Bus, SUGGEST_TRAIN | <advice>).
       Rule C: If Count >= 3: Output: ESCALATE_MANAGER | Limit exceeded. Escalating to Manager.
    
    Return ONLY the decision keyword followed by a pipe | and the user-facing reply.
    """
    
    try:
        response = llm.invoke(prompt)
        content = response.content.strip()
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "RESOURCE_EXHAUSTED" in error_msg:
            print(f"[WARNING] Google AI Rate Limit Exceeded (Free Tier). Switching to Fallback.")
        else:
            print(f"[ERROR] LLM Invocation Failed: {error_msg}")
            
        with open("llm_error.txt", "a", encoding="utf-8") as f:
            f.write(f"\n{error_msg}")
        
        # --- Fallback Logic (Deterministic based on Vector Scores) ---
        print("[INFO] Switching to Deterministic Fallback Logic.")
        
        high_similarity_count = 0
        for m in memory:
            if m.get('score', 0) > 0.60:
                high_similarity_count += 1
        
        # Rule 1: First time (implicitly handled if count == 0 and "Virar" check is fuzzy, 
        # but here we assume if we found no similar history, it's new)
        # New Rules: 
        # 0, 1, 2 past similar -> ESCALATE_TL (Provide suggestion on 0)
        # 3+ past similar -> ESCALATE_MANAGER
        
        # Fallback Slot Filling Check
        # If input looks like a start ("check-in"), assume we need reason
        triggers = ["check-in", "check in", "hi", "start", "login"]
        if any(t in current_text.lower() for t in triggers) and len(current_text.split()) < 3:
            return {"analysis_decision": "ASK_REASON", "response": "Why are you late?"}
        
        if high_similarity_count == 0:
            decision = "ESCALATE_TL"
            
            # Smart Fallback Suggestion Logic
            # If text mentions "bus", "traffic", "stuck" AND any location-like word (heuristic), suggest train.
            # Simplified: If "bus" or "traffic" mentioned, suggest train.
            has_mobility_issue = any(w in current_text.lower() for w in ["bus", "traffic", "stuck", "road", "jam"])
            
            if has_mobility_issue:
                 reply = "You might want to try the train next time to avoid traffic. TL Notified."
            else:
                 reply = "Reason logged. TL Notified."
                 
        elif high_similarity_count < 3:
            decision = "ESCALATE_TL"
            reply = "Reason logged. TL Notified."
        else: # >= 3
            decision = "ESCALATE_MANAGER"
            reply = "Limit exceeded. Escalating to Manager."

        return {"analysis_decision": decision, "response": reply}
    
    # Parse decision
    if "|" in content:
        decision, reply = content.split("|", 1)
    else:
        decision = "LOG_ONLY"
        reply = content
        
    decision = decision.strip()
    reply = reply.strip()
    
    return {"analysis_decision": decision, "response": reply}

def escalation_node(state: AgentState):
    """
    Executes notifications based on decision.
    """
    decision = state["analysis_decision"]
    response = state["response"]
    emp_id = state["employee_id"]
    
    if decision == "ESCALATE_TL":
        notify_hierarchy("team_leader", f"Employee {emp_id} is late again. Reason: {state['current_input']}")
    elif decision == "ESCALATE_MANAGER":
        # Specific User Requested Message Pattern
        # "I have given the suggestion for coming early but employee {name} doesn't listen 
        #  and i had also informed the team leader {name} he also not taken any actions"
        # We use 'Team Leader' as placeholder for TL name as we don't have it in state.
        msg = (f"I have given the suggestion for coming early but employee {emp_id} doesn't listen "
               f"and I had also informed the Team Leader (TL) but no actions were taken. "
               f"Current Reason: {state['current_input']}")
        notify_hierarchy("manager", msg)
    elif decision == "SUGGEST_TRAIN":
        # Usually checking early, but we can append to response
        pass
        
    return {"response": response} # Pass through the response

def save_memory_node(state: AgentState):
    """
    Saves the current interaction to Pinecone.
    """
    print("--- [SAVE] SAVING MEMORY ---")
    emp_id = state["employee_id"]
    text = state["current_input"]
    
    if memory_manager:
        memory_manager.execute(action="save", employee_id=emp_id, text=text)
    return {}

# --- 4. Graph Construction ---

workflow = StateGraph(AgentState)

workflow.add_node("search_memory", search_memory_node)
workflow.add_node("reasoning", reasoning_node)
workflow.add_node("escalate", escalation_node)
workflow.add_node("save_memory", save_memory_node)

workflow.set_entry_point("search_memory")

workflow.add_edge("search_memory", "reasoning")
workflow.add_edge("reasoning", "escalate")
workflow.add_edge("escalate", "save_memory")
workflow.add_edge("save_memory", END)

app = workflow.compile()

# --- 5. Main Execution Helper ---

def run_agent(employee_id: str, message: str):
    print(f"\n>>> PROCESSING INPUT: '{message}' for Employee: {employee_id}")
    inputs = {
        "employee_id": employee_id,
        "current_input": message,
        "memory_context": [],
        "messages": [HumanMessage(content=message)]
    }
    
    result = app.invoke(inputs)
    print(f"[REPLY]: {result['response']}")
    return result

if __name__ == "__main__":
    if not os.environ.get("GOOGLE_API_KEY") or not os.environ.get("PINECONE_API_KEY"):
        print("[ERROR] Error: GOOGLE_API_KEY and PINECONE_API_KEY must be set in environment variables.")
    else:
        run_agent("EMP001", "I am late because of the bus from Virar.")
