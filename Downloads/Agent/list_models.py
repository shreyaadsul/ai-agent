
import os
import google.generativeai as genai

os.environ["GOOGLE_API_KEY"] = "AIzaSyD-I9DnZp_QMzzcNVGHyDGd8Rb8N7qy8pU"
genai.configure(api_key=os.environ["GOOGLE_API_KEY"])

print("Listing available models...")
try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"Name: {m.name}")
except Exception as e:
    print(f"Error listing models: {e}")
