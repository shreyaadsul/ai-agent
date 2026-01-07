
import os
import sys
import uuid
import time
from langchain_core.messages import HumanMessage

# --- SETUP: Set Keys Manually ---
os.environ["GOOGLE_API_KEY"] = "AIzaSyD-I9DnZp_QMzzcNVGHyDGd8Rb8N7qy8pU"
os.environ["PINECONE_API_KEY"] = "pcsk_5imSz4_BvLNHRp8hAeiq4VFGGVHUHWjzyWTSCb4kKXirG6EVTiAMXoCSnmCbiki43o54Lj"

# Add current directory to path so we can import the agent
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from attendance_agent import app

def run_chat():
    emp_id = input("Enter Employee ID (e.g., EMP001): ").strip()
    if not emp_id:
        emp_id = f"EMP_USER_{int(time.time())}"
        print(f"Using Generated Employee ID: {emp_id}")

    print("\n" + "="*50)
    print(f"🤖 Autowhat Attendance Agent (Interactive Mode)")
    print(f"👤 Employee: {emp_id}")
    print("Type 'exit' or 'quit' to stop.")
    print("="*50 + "\n")

    chat_history = []

    while True:
        try:
            user_input = input("You: ").strip()
            if user_input.lower() in ["exit", "quit"]:
                print("Goodbye!")
                break
            
            if not user_input:
                continue

            # Add User Message to History
            chat_history.append(HumanMessage(content=user_input))

            # Run Agent
            inputs = {
                "employee_id": emp_id,
                "current_input": user_input,
                "memory_context": [],
                "messages": chat_history # Pass accumulated history
            }
            
            # We use invoke directly. Note: The agent script prints logs to stdout.
            # In a real app, we would capture this or silence logs. 
            print("...") 
            result = app.invoke(inputs)
            
            # Extract final response
            reply = result.get("response", "No response.")
            print(f"\n🤖 Agent: {reply}\n")
            
            # Add Bot Message to History (for context in next turn)
            # We use HumanMessage for simplistic state, or AIMessage if imported
            # Let's import AIMessage
            from langchain_core.messages import AIMessage
            chat_history.append(AIMessage(content=reply))
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
             # If module import fails inside loop (rare), handle it
            print(f"\n❌ Error: {e}\n")

if __name__ == "__main__":
    run_chat()
