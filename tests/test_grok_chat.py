"""
Tests for grok_chat module
"""
import pytest
from unittest.mock import patch, MagicMock
from fintech_app.grok_chat import GrokChat


class TestGrokChat:
    """Tests for GrokChat class."""

    def test_init_without_api_key(self):
        """Test initialization without API key."""
        chat = GrokChat()
        assert chat.api_key is None
        assert chat.default_model == "grok-4-0709"
        assert chat.conversation_history == []

    def test_init_with_api_key(self):
        """Test initialization with API key."""
        chat = GrokChat(api_key="test-key")
        assert chat.api_key == "test-key"
        assert chat.default_model == "grok-4-0709"

    def test_init_with_custom_model(self):
        """Test initialization with custom default model."""
        chat = GrokChat(default_model="grok-2")
        assert chat.default_model == "grok-2"

    @patch('fintech_app.grok_chat.requests.get')
    def test_get_available_models_with_api_key_success(self, mock_get):
        """Test fetching models from API successfully."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "grok-3", "object": "model"},
                {"id": "grok-2-latest", "object": "model"},
                {"id": "grok-2", "object": "model"}
            ]
        }
        mock_get.return_value = mock_response

        chat = GrokChat(api_key="test-key")
        models = chat.get_available_models()

        assert models == ["grok-3", "grok-2-latest", "grok-2"]
        mock_get.assert_called_once()

    @patch('fintech_app.grok_chat.requests.get')
    def test_get_available_models_api_failure(self, mock_get):
        """Test fallback to default models when API fails."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_get.return_value = mock_response

        chat = GrokChat(api_key="test-key")
        models = chat.get_available_models()

        assert models == ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]

    def test_get_available_models_no_api_key(self):
        """Test returning default models when no API key."""
        chat = GrokChat()
        models = chat.get_available_models()

        assert models == ["grok-4-0709", "grok-3", "grok-2-latest", "grok-2"]

    @patch('fintech_app.grok_chat.requests.post')
    def test_prompt_with_api_key(self, mock_post):
        """Test prompt method with API key."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"content": "Test response"}}
            ]
        }
        mock_post.return_value = mock_response

        chat = GrokChat(api_key="test-key")
        response = chat.prompt("Test input")

        assert response == "Test response"
        assert len(chat.conversation_history) == 2
        assert chat.conversation_history[0]["role"] == "user"
        assert chat.conversation_history[1]["role"] == "assistant"

    def test_prompt_without_api_key(self):
        """Test prompt method without API key (mock mode)."""
        chat = GrokChat()
        response = chat.prompt("Test input")

        assert "Grok (Mock)" in response
        assert "Test input" in response

    @patch('fintech_app.grok_chat.requests.post')
    def test_prompt_api_error(self, mock_post):
        """Test prompt method with API error."""
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"
        mock_post.return_value = mock_response

        chat = GrokChat(api_key="test-key")
        response = chat.prompt("Test input")

        assert "API Error 400" in response

    def test_get_history(self):
        """Test getting conversation history."""
        chat = GrokChat()
        chat.conversation_history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"}
        ]

        history = chat.get_history()
        assert len(history) == 2
        assert history[0]["content"] == "Hello"

    def test_clear_history(self):
        """Test clearing conversation history."""
        chat = GrokChat()
        chat.conversation_history = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"}
        ]

        chat.clear_history()
        assert chat.conversation_history == []

    @patch('fintech_app.grok_chat.requests.post')
    def test_conversation_context(self, mock_post):
        """Test that conversation history is included in API calls."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [
                {"message": {"content": "Contextual response"}}
            ]
        }
        mock_post.return_value = mock_response

        chat = GrokChat(api_key="test-key")

        # First message
        chat.prompt("First message")
        # Second message
        chat.prompt("Second message")

        # Check that the API was called with conversation history
        call_args = mock_post.call_args_list[1][1]  # Second call
        messages = call_args["json"]["messages"]

        assert len(messages) >= 3  # user, assistant, user
        assert messages[-1]["content"] == "Second message"

    @patch('fintech_app.grok_chat.requests.post')
    def test_system_message_included(self, mock_post):
        """Test that system message is always included in API calls."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"choices": [{"message": {"content": "Response"}}]}
        mock_post.return_value = mock_response

        chat = GrokChat(api_key="test-key")
        chat.prompt("Test message")

        # Check the API call
        call_args = mock_post.call_args
        payload = call_args[1]['json']

        # First message should be the system message
        assert payload['messages'][0]['role'] == 'system'
        assert payload['messages'][0]['content'] == "You are an expert Financial Advisor to help me maximize my shares using covered calls strategy"
        # Second message should be the user message
        assert payload['messages'][1]['role'] == 'user'
        assert payload['messages'][1]['content'] == "Test message"
        # Model should be grok-4-0709
        assert payload['model'] == "grok-4-0709"