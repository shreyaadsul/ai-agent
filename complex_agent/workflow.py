
import json
import time
import uuid
from typing import TypedDict, List, Dict, Any
from langgraph.graph import StateGraph, END

from complex_agent.data_layer import VectorMemoryManager, GraphManager
from complex_agent.agents import ComplianceAgent, PerformanceAgent, EscalationAgent, CEOAgent

# --- State ---
class AgentState(TypedDict):
    employee_id: Any
    current_input: Any
    history_matches: Any
    compliance_result: Any
    performance_result: Any
    escalation_decision: Any
    final_response: Any
    graph_trace: Any
    ceo_insight: Any

# --- Init Components ---
memory = VectorMemoryManager()
graph_db = GraphManager()

compliance_agent = ComplianceAgent()
performance_agent = PerformanceAgent()
escalation_agent = EscalationAgent()
ceo_agent = CEOAgent()

# --- Nodes ---

def context_builder_node(state: dict):
    print("--- [1] BUILDING CONTEXT ---")
    emp_id = state.get("employee_id")
    text = state.get("current_input")
    
    matches = memory.search(emp_id, text)
    trace = graph_db.get_decision_trace(emp_id)
    
    return {**state, "history_matches": matches, "graph_trace": trace}

def compliance_node(state: dict):
    print("--- [2] COMPLIANCE CHECK ---")
    policy = "Policy v3.2: Lateness due to public transport disruption is EXCUSED. Personal negligence is NOT EXCUSED. >3 lates/month requires Manager Approval."
    res = compliance_agent.evaluate(state.get("current_input", ""), policy)
    print(f"Compliance: {res}")
    return {**state, "compliance_result": res}

def performance_node(state: dict):
    print("--- [3] PERFORMANCE CHECK ---")
    res = performance_agent.analyze(state.get("history_matches", []))
    print(f"Performance: {res}")
    return {**state, "performance_result": res}

def escalation_node(state: dict):
    print("--- [4] ESCALATION DECISION ---")
    decision = escalation_agent.decide(state.get("compliance_result", ""), state.get("performance_result", ""))
    print(f"Decision: {decision}")
    return {**state, "escalation_decision": decision}

def graph_update_node(state: dict):
    print("--- [5] UPDATING GRAPH ---")
    emp_id = state.get("employee_id")
    
    event_id = str(uuid.uuid4())[:8]
    graph_db.add_node(event_id, "AttendanceEvent", {
        "employee_id": emp_id,
        "input": state.get("current_input"),
        "timestamp": time.time(),
        "decision": state.get("escalation_decision")
    })
    graph_db.add_edge(emp_id, "HAS_EVENT", event_id)
    return state # Pass through

def response_generation_node(state: dict):
    decision = state.get("escalation_decision")
    comp = state.get("compliance_result")
    return {**state, "final_response": f"Status: {decision}. Details: {comp}"}

def ceo_strategy_node(state: dict):
    print("--- [6] CEO AGENT ANALYSIS ---")
    trace = state.get("graph_trace", "")
    if not trace:
        trace = "No prior history."
    
    insight = ceo_agent.strategize(trace + f"\nNew Event: {state.get('current_input')} -> {state.get('escalation_decision')}")
    print(f"CEO Insight: {insight}")
    return {**state, "ceo_insight": insight}

# --- Graph ---
workflow = StateGraph(dict)

workflow.add_node("context", context_builder_node)
workflow.add_node("compliance", compliance_node)
workflow.add_node("performance", performance_node)
workflow.add_node("escalation", escalation_node)
workflow.add_node("graph_update", graph_update_node)
workflow.add_node("response", response_generation_node)
workflow.add_node("ceo_agent", ceo_strategy_node)

workflow.set_entry_point("context")
# Linear flow for safety on simplistic dict state
workflow.add_edge("context", "compliance")
workflow.add_edge("compliance", "performance")
workflow.add_edge("performance", "escalation")
workflow.add_edge("escalation", "graph_update")
workflow.add_edge("graph_update", "response")
workflow.add_edge("response", "ceo_agent")
workflow.add_edge("ceo_agent", END)

app = workflow.compile()
