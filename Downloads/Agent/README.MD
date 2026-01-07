# 🤖 Basic AI Agent

This project contains a **basic AI agent framework built in Python**.  
It is designed to experiment with LLM-based agents, interactive workflows, testing, and error handling.  
The structure is modular and easy to extend for real-world use cases like chatbots, attendance systems, or WhatsApp agents.

---

## 📁 Project Structure

Agent/
├── attendance_agent.py # Core agent logic for attendance use case
├── interactive_agent.py # CLI-based interactive agent
├── serve_agent.py # Server/API runner for the agent
├── test_simulation.py # Agent simulation and testing
├── list_models.py # Lists available LLM models
│
├── valid_models.txt # Valid model list
├── valid_models_v2.txt
├── installed.txt # Installed dependencies snapshot
│
├── chat_test_out.txt # Chat test output
├── embed_test_out.txt # Embedding test output
├── output.txt # General output logs
│
├── error_log.txt # Runtime errors
├── error_sim.txt # Simulation errors
├── llm_error.txt # LLM-specific errors
│
├── pycache/ # Python cache files
└── README.md


---

## ✨ Features

- Modular AI agent design
- Interactive command-line agent
- Attendance-based agent logic
- LLM model validation & testing
- Error logging and simulation support
- Easily extendable for APIs or messaging platforms

---

## 🛠️ Requirements

- Python 3.9+
- LLM API access (configurable)
- Optional: Vector DB support (Pinecone-ready)

---

## ▶️ How to Run

### Run Interactive Agent
```bash
python interactive_agent.py

Run Attendance Agent
python attendance_agent.py

Start Agent Server
python serve_agent.py

Run Simulation Tests
python test_simulation.py

Logs & Outputs

Chat outputs → chat_test_out.txt

Embedding outputs → embed_test_out.txt

Runtime errors → error_log.txt

LLM errors → llm_error.txt

👩‍💻 Author

Shreya Adsul
B.Sc CS (AIML)

📜 License

This project is intended for learning and experimental purposes.

