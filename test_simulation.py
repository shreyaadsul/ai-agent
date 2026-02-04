# --- SETUP ENV VARS BEFORE IMPORTS ---
import os
import sys

# Manually set keys for the session (Must be done before importing agent)
os.environ["GOOGLE_API_KEY"] = "AIzaSyD-I9DnZp_QMzzcNVGHyDGd8Rb8N7qy8pU"
os.environ["PINECONE_API_KEY"] = "pcsk_5imSz4_BvLNHRp8hAeiq4VFGGVHUHWjzyWTSCb4kKXirG6EVTiAMXoCSnmCbiki43o54Lj"

import time

# Add current directory to path so we can import the agent
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from attendance_agent import run_agent

def run_simulation():
    """
    Simulates a 3-step scenario to test the Autowhat Agent's escalation logic.
    """
    
    # Keys are already set at the top level
    
    # Use a unique ID to ensure fresh state for the test
    unique_emp_id = f"EMP_TEST_{int(time.time())}"
    
    print(f"[START] STARTING ATENDANCE AGENT SIMULATION")
    print(f"[USER] Employee ID: {unique_emp_id}")
    print("="*50)
    
    # --- SCENARIO 1: First Occurrence ---
    # Expected: "Virar" + "Bus" -> Suggest Train (System logic for 1st time)
    print("\n[STEP 1] User reports late arrival (Virar Bus) - FIRST TIME")
    msg_1 = "I am late today because the bus from Virar got stuck in heavy traffic."
    result_1 = run_agent(unique_emp_id, msg_1)
    
    # Check logs visually or assert logic (Here we just print for the user to verify)
    print(f"Expected: Suggest Train / Log Only")
    print(f"Actual Decision: {result_1.get('analysis_decision', 'N/A')}")
    
    print("\n[WAIT] Waiting for Pinecone consistency...")
    time.sleep(15) # Give Pinecone time to index
    
    # --- SCENARIO 2: Second Occurrence ---
    # Expected: Similarity > 0.85 found -> Escalate to TL
    print("\n[STEP 2] User reports late arrival (Similar Reason) - SECOND TIME")
    msg_2 = "Late again. The bus traffic is terrible."
    result_2 = run_agent(unique_emp_id, msg_2)
    
    print(f"Expected: ESCALATE_TL")
    print(f"Actual Decision: {result_2.get('analysis_decision', 'N/A')}")
    
    print("\n[WAIT] Waiting for Pinecone consistency...")
    time.sleep(15)
    
    # --- SCENARIO 3: Third Occurrence ---
    # Expected: 3rd Strike -> Escalate to Manager
    print("\n[STEP 3] User reports late arrival (Similar Reason) - THIRD TIME")
    msg_3 = "Sorry, bus issue again. Will be there soon."
    result_3 = run_agent(unique_emp_id, msg_3)
    
    print(f"Expected: ESCALATE_MANAGER")
    print(f"Actual Decision: {result_3.get('analysis_decision', 'N/A')}")
    
    print("\n[DONE] SIMULATION COMPLETE. Check proper escalation logs above.")

if __name__ == "__main__":
    run_simulation()
