"""
Grok Chat - Text prompt and response interface
Console version with xAI API integration
"""
from typing import Optional, List, Dict
import sys
import os
import requests
from datetime import datetime


class GrokChat:
    """Text-based chat interface for Grok with xAI API integration."""

    def __init__(self, api_key: Optional[str] = None, default_model: str = "grok-4-0709"):
        self.api_key = api_key or os.getenv('XAI_API_KEY')
        self.default_model = os.getenv('XAI_MODEL', default_model)
        self.conversation_history: List[Dict[str, str]] = []
        self.system_message = {
            "role": "system",
            "content":
             "You are an expert Financial Advisor to help me maximize my shares using covered calls strategy"
        }
        self.base_url = "https://api.x.ai/v1"

        if not self.api_key:
            print("Warning: No XAI API key found. Set XAI_API_KEY environment variable or pass api_key to constructor.")
            print("Using mock responses for now.")

    def prompt(self, user_input: str, model: Optional[str] = None) -> str:
        """
        Process user prompt and return response from xAI API.

        Args:
            user_input: User's text prompt
            model: xAI model to use (default: grok-3)

        Returns:
            Response text from Grok
        """
        # Store in history
        self.conversation_history.append({"role": "user", "content": user_input})

        try:
            if self.api_key:
                response = self._call_xai_api(user_input, model or self.default_model)
            else:
                response = f"Grok (Mock): I understand you said '{user_input}'. Please set your XAI_API_KEY to get real responses."
        except Exception as e:
            response = f"Error calling xAI API: {e}"

        # Store response in history
        self.conversation_history.append({"role": "assistant", "content": response})

        return response

    def get_available_models(self) -> List[str]:
        """Fetch available models from xAI API."""
        if not self.api_key:
            # Return default models if no API key
            return ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.get(
                f"{self.base_url}/models",
                headers=headers,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                # Extract model IDs from the response
                if 'data' in data:
                    models = [model['id'] for model in data['data'] if 'id' in model]
                    return models if models else ["grok-3", "grok-2-latest", "grok-2"]
                else:
                    return ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]
            else:
                print(f"Failed to fetch models: {response.status_code}")
                return ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]

        except Exception as e:
            print(f"Error fetching models: {e}")
            return ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]

    def _call_xai_api(self, user_input: str, model: str) -> str:
        """Make API call to xAI chat completions endpoint."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        # Prepare messages (always start with system message, then conversation history)
        messages = [self.system_message]  # System message first
        messages.extend(self.conversation_history[-9:])  # Keep last 9 messages for context (system + 9 = 10 total)
        messages.append({"role": "user", "content": user_input})

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": 1000,
            "temperature": 0.7
        }

        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                data = response.json()
                if 'choices' in data and len(data['choices']) > 0:
                    return data['choices'][0]['message']['content']
                else:
                    return "No response from Grok API"
            else:
                return f"API Error {response.status_code}: {response.text}"

        except requests.exceptions.RequestException as e:
            return f"Network error: {e}"
    
    def get_history(self) -> list:
        """Get conversation history."""
        return self.conversation_history
    
    def clear_history(self):
        """Clear conversation history."""
        self.conversation_history = []


def console_chat():
    """Run console-based chat interface with xAI integration."""
    print("Grok Chat Configuration:")
    print("- Set XAI_API_KEY environment variable for automatic API key")
    print("- Set XAI_MODEL environment variable for default model (grok-4-0709, grok-3, grok-2-latest, grok-2)")
    print()

    # Get API key from environment or prompt
    api_key = os.getenv('XAI_API_KEY')
    if not api_key:
        print("XAI API key not found in environment variable XAI_API_KEY")
        api_key = input("Enter your xAI API key (or press Enter for mock mode): ").strip()
        if not api_key:
            print("Using mock mode - responses will be simulated.")

    # Get available models dynamically
    chat_temp = GrokChat(api_key=api_key)  # Temporary instance to fetch models
    available_models = chat_temp.get_available_models()

    default_model = os.getenv('XAI_MODEL', 'grok-4-0709')

    # Find best default if environment variable model not available
    if default_model not in available_models:
        # Try to find the latest grok model
        for model in ['grok-4-0709', 'grok-3', 'grok-2-latest', 'grok-2']:
            if model in available_models:
                default_model = model
                break
        else:
            # Use first available model
            default_model = available_models[0] if available_models else 'grok-4-0709'

    print(f"\nAvailable models: {', '.join(available_models)}")
    print(f"Current default: {default_model}")

    selected_model = input(f"Choose model (press Enter for {default_model}): ").strip()
    if not selected_model:
        selected_model = default_model
    elif selected_model not in available_models:
        print(f"Invalid model. Using default: {default_model}")
        selected_model = default_model

    chat = GrokChat(api_key=api_key)

    # Get available models dynamically
    available_models = chat.get_available_models()

    print("=" * 60)
    print("Grok Chat - Console Version")
    print("Commands: 'exit'/'quit' to end, 'clear' to clear history, 'model' to change model")
    print(f"API Key: {'Set' if api_key else 'Not set (mock mode)'}")
    print(f"Model: {selected_model}")
    print(f"Available models: {len(available_models)} models found")
    print("=" * 60)
    print()

    while True:
        try:
            # Get user input
            user_input = input("You: ").strip()

            if not user_input:
                continue

            # Handle commands
            if user_input.lower() in ['exit', 'quit']:
                print("\nGoodbye!")
                break

            if user_input.lower() == 'clear':
                chat.clear_history()
                print("Conversation history cleared.\n")
                continue

            if user_input.lower() == 'model':
                # Allow changing model during conversation
                print(f"\nCurrent model: {selected_model}")
                print(f"Available models: {', '.join(available_models)}")
                new_model = input("Choose new model (press Enter to keep current): ").strip()
                if new_model and new_model in available_models:
                    selected_model = new_model
                    print(f"Model changed to: {selected_model}")
                elif new_model:
                    print(f"Invalid model. Keeping current: {selected_model}")
                print()
                continue

            # Get response
            print("Grok: ", end="", flush=True)
            response = chat.prompt(user_input, model=selected_model)
            print(response + "\n")

        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except EOFError:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"Error: {e}\n")


if __name__ == "__main__":
    console_chat()
