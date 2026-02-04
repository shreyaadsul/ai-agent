
import os
import time
import uuid
import json
from typing import List, Dict, Any
from pinecone import Pinecone, ServerlessSpec
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# --- Configuration ---
INDEX_NAME = "index-autowhat-v1"
EMBEDDING_MODEL = "models/text-embedding-004"

class VectorMemoryManager:
    """
    Manages interactions with Pinecone for storage and retrieval.
    """
    def __init__(self):
        self.api_key = os.environ.get("PINECONE_API_KEY")
        if not self.api_key:
            print("[WARNING] PINECONE_API_KEY not set. Vector memory disabled.")
            self.pc = None
            return

        self.embeddings = GoogleGenerativeAIEmbeddings(model=EMBEDDING_MODEL, google_api_key=os.environ.get("GOOGLE_API_KEY"))
        self.pc = Pinecone(api_key=self.api_key)
        
        # Ensure index exists
        try:
            existing_indexes = [i.name for i in self.pc.list_indexes()]
            if INDEX_NAME not in existing_indexes:
                print(f"[INFO] Creating Pinecone Index '{INDEX_NAME}'...")
                self.pc.create_index(
                    name=INDEX_NAME,
                    dimension=768, 
                    metric="cosine",
                    spec=ServerlessSpec(cloud="aws", region="us-east-1")
                )
                time.sleep(2)
            self.index = self.pc.Index(INDEX_NAME)
        except Exception as e:
            print(f"[ERROR] Pinecone Init Error: {e}")
            self.pc = None

    def search(self, employee_id: str, text: str, top_k=5):
        if not self.pc: 
            return [{"content": "Mock Memory: User was late due to rain last week.", "score": 0.85}]
            
        try:
            vector = self.embeddings.embed_query(text)
        except Exception as e:
            print(f"[WARNING] Embedding API Error: {e}. Returning MOCK history.")
            return [{"content": "Mock Memory: User was late due to rain last week.", "score": 0.85}]

        try:
            filter_dict = {"employee_id": {"$eq": employee_id}}
            results = self.index.query(vector=vector, top_k=top_k, filter=filter_dict, include_metadata=True)
            return [m['metadata'] for m in results.get('matches', [])]
        except Exception as e:
            print(f"[ERROR] Vector Search Failed: {e}")
            return []

    def save(self, employee_id: str, text: str):
        if not self.pc: return
        try:
            vector = self.embeddings.embed_query(text)
            metadata = {
                "employee_id": employee_id, 
                "timestamp": time.time(),
                "text": text
            }
            self.index.upsert(vectors=[(str(uuid.uuid4()), vector, metadata)])
        except Exception as e:
            print(f"[WARNING] Vector Save Failed (likely API error): {e}")

class GraphManager:
    """
    Simulates a Neo4j Graph Database using an in-memory NetworkX-style structure.
    Persists to a JSON file for this demo.
    """
    def __init__(self, db_path="graph_db.json"):
        self.db_path = db_path
        self.nodes = {} # id -> data
        self.edges = [] # (source, relation, target)
        self.load()

    def load(self):
        if os.path.exists(self.db_path):
            with open(self.db_path, "r") as f:
                data = json.load(f)
                self.nodes = data.get("nodes", {})
                self.edges = data.get("edges", [])

    def save(self):
        with open(self.db_path, "w") as f:
            json.dump({"nodes": self.nodes, "edges": self.edges}, f, indent=2)

    def add_node(self, node_id: str, label: str, properties: Dict):
        self.nodes[node_id] = {"label": label, **properties}
        self.save()

    def add_edge(self, source_id: str, relation: str, target_id: str):
        self.edges.append({"source": source_id, "relation": relation, "target": target_id})
        self.save()

    def get_decision_trace(self, employee_id: str):
        # Return a simplified text representation of the graph for the LLM
        trace = []
        # Find events related to employee
        for nid, data in self.nodes.items():
            if data.get("employee_id") == employee_id:
                trace.append(f"Node({data['label']}): {data}")
        
        # In a real graph, we would traverse edges. 
        # Here we just dump everything for the employee.
        return "\n".join(trace)
