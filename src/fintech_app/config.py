from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


_DEFAULT_CONFIG: Dict[str, Any] = {
    "TSLA_SHARES": 525,
    "CASH_AVAILABLE": 0,
    "RISK_TOLERANCE": 0.05,
    "EPS_PROJECTIONS": {
        "2025": 1.64,
        "2026": 2.17,
        "2030": 11.24
    },
    "BULLISH_THRESHOLD": 50,
    "DIP_THRESHOLD": 30,
    "OPTIONS_MIN_WEEKS": 2,
    "OPTIONS_MAX_WEEKS": 4,
    "ENABLE_COVERED_CALLS": True,
    "ENABLE_WHEEL_STRATEGY": True,
    "WHEEL_PUT_OTM_PCT": [0.05, 0.075, 0.10],
    "WHEEL_MIN_CASH_RATIO": 1.1
}

_CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "config.json"


def _load_config() -> Dict[str, Any]:
    if not _CONFIG_PATH.exists():
        return dict(_DEFAULT_CONFIG)
    try:
        data = json.loads(_CONFIG_PATH.read_text())
        if not isinstance(data, dict):
            return dict(_DEFAULT_CONFIG)
        merged = dict(_DEFAULT_CONFIG)
        merged.update(data)
        eps = merged.get("EPS_PROJECTIONS")
        if isinstance(eps, dict):
            normalized = {}
            for key, value in eps.items():
                try:
                    normalized[int(key)] = value
                except (TypeError, ValueError):
                    normalized[key] = value
            merged["EPS_PROJECTIONS"] = normalized
        return merged
    except Exception:
        return dict(_DEFAULT_CONFIG)


_CONFIG = _load_config()

# User settings for portfolio and strategy thresholds
TSLA_SHARES = _CONFIG["TSLA_SHARES"]  # Your current holdings
CASH_AVAILABLE = _CONFIG["CASH_AVAILABLE"]  # Cash for options trading (wheel strategy needs cash for put collateral)
RISK_TOLERANCE = _CONFIG["RISK_TOLERANCE"]  # Max % of portfolio at risk per trade
EPS_PROJECTIONS = _CONFIG["EPS_PROJECTIONS"]
BULLISH_THRESHOLD = _CONFIG["BULLISH_THRESHOLD"]  # RSI above this = bullish (favor calls)
DIP_THRESHOLD = _CONFIG["DIP_THRESHOLD"]  # RSI below this = dip (favor puts for hedge)

# Options expiration filter (in weeks from today)
OPTIONS_MIN_WEEKS = _CONFIG["OPTIONS_MIN_WEEKS"]  # Minimum weeks until expiration
OPTIONS_MAX_WEEKS = _CONFIG["OPTIONS_MAX_WEEKS"]  # Maximum weeks until expiration

# Strategy selection
ENABLE_COVERED_CALLS = _CONFIG["ENABLE_COVERED_CALLS"]  # Show covered call recommendations
ENABLE_WHEEL_STRATEGY = _CONFIG["ENABLE_WHEEL_STRATEGY"]  # Show wheel strategy (cash-secured puts + covered calls)

# Wheel Strategy settings
WHEEL_PUT_OTM_PCT = _CONFIG["WHEEL_PUT_OTM_PCT"]  # Put strikes: 5%, 7.5%, 10% below current price
WHEEL_MIN_CASH_RATIO = _CONFIG["WHEEL_MIN_CASH_RATIO"]  # Require 110% of strike * 100 * qty in cash for collateral
