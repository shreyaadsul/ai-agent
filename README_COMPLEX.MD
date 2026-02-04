# 🚀 Complex Multi-Agent Attendance System

This project implements the **Member of Staff / CEO Agent Architecture** depicted in your diagram.  
It upgrades the simple chatbot into a robust, multi-agent system with specialized roles, graph tracking, and strategic insight.

---

## 🏗️ Architecture Overview

The system is split into specialized agents, orchestrated by **LangGraph**:

| Agent / Component | Role | Logic Location |
| :--- | :--- | :--- |
| **Operational Agents** | Handle real-time requests. | `complex_agent/agents.py` |
| 🛡️ **Compliance Agent** | Validates excuses against policy. | `ComplianceAgent` |
| 📈 **Performance Agent** | Checks patterns (Vector DB). | `PerformanceAgent` |
| 🚨 **Escalation Agent** | Routes to Manager/HR/None. | `EscalationAgent` |
| **Meta Agents** | High-level strategy. | `complex_agent/agents.py` |
| 👔 **CEO Agent** | Reviews systemic issues & policy. | `CEOAgent` |
| **Data Layer** | | `complex_agent/data_layer.py` |
| 🧠 **Vector Memory** | Pinecone integration (History). | `VectorMemoryManager` |
| 🕸️ **Graph Trace** | Tracks decision reasoning (Mock Neo4j). | `GraphManager` |

---

## 🏃‍♂️ How to Run

1. **Install Dependencies** (if needed):
   ```bash
   pip install langgraph langchain-google-genai pinecone-client
   ```

2. **Run the System**:
   ```bash
   python run_complex_agent.py
   ```

3. **Interact**:
   - Enter an Employee ID (e.g., `Ramesh`).
   - Enter a reason for lateness (e.g., *"I am late due to traffic at the bridge"*).
   - Watch the agents coordinate!

---

## 🔍 File Structure

```text
Agent/
├── run_complex_agent.py       # <--- START HERE. Entry point.
├── complex_agent/             # Package folder
│   ├── __init__.py
│   ├── workflow.py            # LangGraph State Machine (The Brain)
│   ├── agents.py              # Individual Agent Definitions (Prompting)
│   └── data_layer.py          # Database Connectors (Pinecone/Graph)
```

## 🧩 Key Features Implemented

*   **Multi-Agent Co-operation**: Logic isn't in one file; it's passed between agents.
*   **CEO Insight**: Every interaction produces a "strategic insight" as if the CEO is watching.
*   **Graph Tracing**: Decisions are logged as nodes/edges (saved to `graph_db.json`).
*   **Vector History**: Uses your existing Pinecone setup to find similar past excuses.

---

*Note: The system uses the API Keys found in your `interactive_agent.py`. If you see "Permission Denied", please verify your Google Cloud API keys.*
