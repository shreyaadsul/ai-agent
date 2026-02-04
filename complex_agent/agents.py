
import os
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

# --- Configuration ---
LLM_MODEL = "models/gemini-2.0-flash-exp"

class BaseAgent:
    def __init__(self):
        self.llm = ChatGoogleGenerativeAI(
            model=LLM_MODEL, 
            temperature=0, 
            google_api_key=os.environ.get("GOOGLE_API_KEY")
        )

    def safe_invoke(self, prompt: str, mock_response: str):
        try:
            response = self.llm.invoke(prompt)
            return response.content
        except Exception as e:
            print(f"[WARNING] LLM Error: {e}. Using Mock Response.")
            return mock_response

class ComplianceAgent(BaseAgent):
    """
    Checks if the reason provided complies with the policy.
    """
    def evaluate(self, reason: str, policy_context: str):
        prompt = f"""
        You are the Compliance Agent.
        Policy Context: {policy_context}
        
        Employee Reason: "{reason}"
        
        Task: Determine if this reason is acceptable under the current policy.
        Output: JSON with {{ "approved": boolean, "reasoning": "brief explanation" }}
        """
        return self.safe_invoke(prompt, '{"approved": true, "reasoning": "Mock: Reason accepted due to API error."}')

class PerformanceAgent(BaseAgent):
    """
    Analyzes employee history for patterns.
    """
    def analyze(self, history: list):
        summary_history = "\n".join([str(h) for h in history])
        prompt = f"""
        You are the Performance Agent.
        Employee History:
        {summary_history}
        
        Task: Analyze the lateness patterns.
        Output: JSON with {{ "risk_score": 0-100, "pattern": "e.g., habitual Monday lateness", "recommendation": "..." }}
        """
        return self.safe_invoke(prompt, '{"risk_score": 50, "pattern": "Mock Pattern", "recommendation": "None"}')

class EscalationAgent(BaseAgent):
    """
    Decides who needs to be notified.
    """
    def decide(self, compliance_result: str, performance_result: str):
        prompt = f"""
        You are the Escalation Agent.
        Compliance Result: {compliance_result}
        Performance Result: {performance_result}
        
        Task: Decide on the escalation path.
        Options: "None", "Notify Manager", "Notify HR", "Disciplinary Action".
        Output: Just the option.
        """
        return self.safe_invoke(prompt, "Notify Manager").strip()

class CEOAgent(BaseAgent):
    """
    Strategic Agent looking at the big picture.
    """
    def strategize(self, events: str):
        prompt = f"""
        You are the CEO Agent. You oversee the entire workforce attendance.
        Recent Events:
        {events}
        
        Task:
        1. Identify systemic issues (e.g., is "Traffic" a common excuse in Plant X?).
        2. Recommend policy updates.
        
        Output: A strategic summary in bullet points.
        """
        return self.safe_invoke(prompt, "- Mock Strategic Insight: Review transport policy.")
