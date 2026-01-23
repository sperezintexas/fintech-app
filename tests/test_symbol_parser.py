"""
Tests for symbol parser (OCC and Merrill formats)
"""
import pytest
import sys
from pathlib import Path

# Add pages directory to path to import the parse_symbol function
pages_path = Path(__file__).parent.parent / "pages"
sys.path.insert(0, str(pages_path))

# Import the parse_symbol function from grokbot
import importlib.util
spec = importlib.util.spec_from_file_location("managePortfolio", pages_path / "managePortfolio.py")
managePortfolio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(managePortfolio)
parse_symbol = managePortfolio.parse_symbol


class TestSymbolParser:
    """Unit tests for symbol parser (OCC and Merrill formats)."""
    
    def test_occ_format_call(self):
        """Test OCC format parsing for a call option."""
        # TSLA260227C00455000 = TSLA Feb 27, 2026 $455.00 Call
        result = parse_symbol("TSLA260227C00455000")
        
        assert result is not None
        assert result["root"] == "TSLA"
        assert result["expiration"] == "2026-02-27"
        assert result["pos_type"] == "call"
        assert result["strike"] == 455.0
        assert result["format"] == "occ"
    
    def test_occ_format_put(self):
        """Test OCC format parsing for a put option."""
        # TSLA260227P00400000 = TSLA Feb 27, 2026 $400.00 Put
        result = parse_symbol("TSLA260227P00400000")
        
        assert result is not None
        assert result["root"] == "TSLA"
        assert result["expiration"] == "2026-02-27"
        assert result["pos_type"] == "put"
        assert result["strike"] == 400.0
        assert result["format"] == "occ"
    
    def test_merrill_format_call_jan_30_2026(self):
        """Test Merrill format parsing for TSLA#A3026C475000 = TSLA JAN 30, 2026 475.00 CALL."""
        result = parse_symbol("TSLA#A3026C475000")
        
        assert result is not None, "Parser should return a result for valid Merrill format"
        assert result["root"] == "TSLA", f"Expected root 'TSLA', got '{result['root']}'"
        assert result["expiration"] == "2026-01-30", f"Expected expiration '2026-01-30', got '{result['expiration']}'"
        assert result["pos_type"] == "call", f"Expected pos_type 'call', got '{result['pos_type']}'"
        assert result["strike"] == 475.0, f"Expected strike 475.0, got {result['strike']}"
        assert result["format"] == "merrill", f"Expected format 'merrill', got '{result['format']}'"
    
    def test_merrill_format_put(self):
        """Test Merrill format parsing for a put option."""
        # TSLA#A3026P450000 = TSLA Jan 30, 2026 $450.00 Put
        result = parse_symbol("TSLA#A3026P450000")
        
        assert result is not None
        assert result["root"] == "TSLA"
        assert result["expiration"] == "2026-01-30"
        assert result["pos_type"] == "put"
        assert result["strike"] == 450.0
        assert result["format"] == "merrill"
    
    def test_merrill_format_year_code_b(self):
        """Test Merrill format with year code B (2027)."""
        # TSLA#B3026C475000 = TSLA Jan 30, 2027 $475.00 Call
        result = parse_symbol("TSLA#B3026C475000")
        
        assert result is not None
        assert result["root"] == "TSLA"
        assert result["expiration"] == "2027-01-30"
        assert result["pos_type"] == "call"
        assert result["strike"] == 475.0
        assert result["format"] == "merrill"
    
    def test_invalid_format(self):
        """Test that invalid format returns None."""
        result = parse_symbol("INVALID_FORMAT")
        assert result is None
    
    def test_empty_string(self):
        """Test that empty string returns None."""
        result = parse_symbol("")
        assert result is None
    
    def test_case_insensitive(self):
        """Test that parser is case insensitive."""
        result_lower = parse_symbol("tsla#a3026c475000")
        result_upper = parse_symbol("TSLA#A3026C475000")
        
        assert result_lower is not None
        assert result_upper is not None
        assert result_lower == result_upper
