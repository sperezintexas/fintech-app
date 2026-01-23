import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from .config import OPTIONS_MIN_WEEKS, OPTIONS_MAX_WEEKS

def fetch_symbol_data(symbol: str = "TSLA", period="1y", interval="1d", min_weeks=None, max_weeks=None):
    """Fetch historical prices, options, and info for the symbol.
    
    Args:
        period: Historical data period
        interval: Historical data interval
        min_weeks: Optional minimum weeks to filter options (if None, uses config or fetches all)
        max_weeks: Optional maximum weeks to filter options (if None, uses config or fetches all)
    """
    ticker = yf.Ticker(symbol)
    historical_data = ticker.history(period=period, interval=interval)
    options_dates = ticker.options
    
    # Use provided week range or config defaults; if both are None, fetch all
    if not (min_weeks is None and max_weeks is None):
        if min_weeks is None:
            min_weeks = OPTIONS_MIN_WEEKS
        if max_weeks is None:
            max_weeks = OPTIONS_MAX_WEEKS
    
    options_data = {}
    today = datetime.now().date()
    
    for date_str in options_dates:
        try:
            exp_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            weeks_to_exp = (exp_date - today).days / 7
            
            # Filter by week range if specified
            if min_weeks is not None and max_weeks is not None:
                if min_weeks <= weeks_to_exp <= max_weeks:
                    options_data[date_str] = {
                        'calls': ticker.option_chain(date_str).calls,
                        'puts': ticker.option_chain(date_str).puts
                    }
            else:
                # Fetch all options if no range specified
                options_data[date_str] = {
                    'calls': ticker.option_chain(date_str).calls,
                    'puts': ticker.option_chain(date_str).puts
                }
        except ValueError:
            # Skip invalid date formats
            continue
    
    info = ticker.info  # Includes current price, EPS, etc.
    return historical_data, options_data, info

def cache_data(data, filename="tsla_cache.csv"):
    """Cache historical data to avoid rate limits."""
    data.to_csv(filename)
    return data
