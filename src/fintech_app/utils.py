import numpy as np
import pandas as pd
from datetime import datetime
from .config import EPS_PROJECTIONS, RISK_TOLERANCE

def calculate_moving_average(data, window=50):
    """50-day SMA for trend analysis."""
    return data['Close'].rolling(window=window).mean()

def calculate_rsi(data, period=14):
    """Relative Strength Index for buy/sell signals."""
    delta = data['Close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

def estimate_premium(option_data, strike, is_call=True):
    """Rough premium estimate based on closest strike."""
    df = option_data['calls'] if is_call else option_data['puts']
    closest = df.iloc[(df['strike'] - strike).abs().argsort()[:1]]
    return closest['lastPrice'].values[0] if not closest.empty else 0

def project_yield(current_price, eps_growth_rate=0.33, years=5):
    """Project future price based on EPS growth for profit maximization."""
    future_eps = EPS_PROJECTIONS[2025] * (1 + eps_growth_rate) ** years
    pe_ratio = 300  # Current high P/E; adjust based on market
    future_price = future_eps * pe_ratio
    yield_pct = ((future_price - current_price) / current_price) * 100 / years
    return yield_pct

def risk_adjusted_qty(portfolio_value, premium, risk_tolerance=RISK_TOLERANCE):
    """Max qty based on risk tolerance."""
    if premium <= 0:
        return 0
    return int((portfolio_value * risk_tolerance) / (premium * 100))

def filter_options_by_weeks(options: dict, min_w: int, max_w: int) -> dict:
    today = datetime.now().date()
    filtered = {}
    for date_str, opts in options.items():
        try:
            exp_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            weeks_to_exp = (exp_date - today).days / 7
            if min_w <= weeks_to_exp <= max_w:
                filtered[date_str] = opts
        except Exception:
            continue
    return filtered

def generate_option_rationale(strike, current_price, rsi, is_call=True, expiration_date=None):
    """Generate rationale for an option based on market conditions."""
    otm_pct = ((strike - current_price) / current_price) * 100 if is_call else ((current_price - strike) / current_price) * 100
    
    if is_call:
        if otm_pct >= 0:
            return f"Generate income ({otm_pct:.1f}% OTM, RSI {rsi:.1f})"
        else:
            return f"ITM call ({otm_pct:.1f}% ITM, RSI {rsi:.1f})"
    else:
        if otm_pct >= 0:
            return f"Wheel strategy ({otm_pct:.1f}% OTM, RSI {rsi:.1f})"
        else:
            return f"ITM put ({otm_pct:.1f}% ITM, RSI {rsi:.1f})"
