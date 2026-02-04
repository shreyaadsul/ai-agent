
import os
import sys
import time

# --- SETUP: Set Keys Manually ---
os.environ["GOOGLE_API_KEY"] = "AIzaSyD-I9DnZp_QMzzcNVGHyDGd8Rb8N7qy8pU"
os.environ["PINECONE_API_KEY"] = "pcsk_5imSz4_BvLNHRp8hAeiq4VFGGVHUHWjzyWTSCb4kKXirG6EVTiAMXoCSnmCbiki43o54Lj"

# Ensure we can import the package
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from complex_agent.workflow import app

def main():
    print("="*60)
    print("🚀 CEO-Driven Multi-Agent Attendance System")
    print("="*60)
    
    emp_id = input("Enter Employee ID (e.g., Ramesh): ").strip() or "Ramesh"
    
    while True:
        user_input = input(f"\n({emp_id}) > ").strip()
        if user_input.lower() in ["exit", "quit"]:
            break
            
        print("\n... Agents Thinking ...\n")
        
        inputs = {
            "employee_id": emp_id,
            "current_input": user_input,
            "history_matches": [],
            "compliance_result": "",
            "performance_result": "",
            "escalation_decision": "",
            "final_response": "",
            "graph_trace": "",
            "ceo_insight": ""
        }
        
        try:
            result = app.invoke(inputs)
            
            print("\n---------- DECISION ----------")
            print(result["final_response"])
            
            print("\n---------- CEO STRATEGY ----------")
            print(result.get("ceo_insight", "No strategic insight generated."))
            
            print("----------------------------------")
            
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    main()
