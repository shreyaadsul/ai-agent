
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
import sys
import uvicorn

# --- ENV SETUP ---
# Ensure keys are present (In production, use strict ENV vars)
os.environ["GOOGLE_API_KEY"] = "AIzaSyD-I9DnZp_QMzzcNVGHyDGd8Rb8N7qy8pU"
os.environ["PINECONE_API_KEY"] = "pcsk_5imSz4_BvLNHRp8hAeiq4VFGGVHUHWjzyWTSCb4kKXirG6EVTiAMXoCSnmCbiki43o54Lj"

# Import Agent
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from attendance_agent import app
from langchain_core.messages import HumanMessage

api = FastAPI(title="Autowhat Attendance Agent API")

class ChatRequest(BaseModel):
    employee_id: str
    message: str

@api.get("/")
def health_check():
    return {"status": "active", "service": "Attendance Agent"}

@api.post("/chat")
def chat_endpoint(req: ChatRequest):
    """
    Main endpoint for WhatsApp Webhook to call.
    """
    try:
        print(f"Incoming: {req.employee_id} - {req.message}")
        
        inputs = {
            "employee_id": req.employee_id,
            "current_input": req.message,
            "memory_context": [],
            "messages": [HumanMessage(content=req.message)]
        }
        
        # Invoke Agent
        result = app.invoke(inputs)
        
        # Extract Response
        bot_reply = result.get("response", "Processing error.")
        decision = result.get("analysis_decision", "LOG_ONLY")
        
        return {
            "reply": bot_reply,
            "decision": decision,
            "status": "success"
        }
        
    except Exception as e:
        print(f"API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    # Run with: python serve_agent.py
    print("🚀 AutoWhat Agent API is running on http://localhost:8000")
    uvicorn.run(api, host="0.0.0.0", port=8000)
