from .utils import calculate_moving_average, calculate_rsi, estimate_premium, project_yield, risk_adjusted_qty
from .config import (
    BULLISH_THRESHOLD, DIP_THRESHOLD, ENABLE_COVERED_CALLS, ENABLE_WHEEL_STRATEGY,
    WHEEL_PUT_OTM_PCT, WHEEL_MIN_CASH_RATIO
)
from datetime import datetime

def _calculate_annualized_yield(premium, current_price, expiration_date):
    """Calculate annualized yield for an option."""
    try:
        exp_date = datetime.strptime(expiration_date, '%Y-%m-%d')
        days_to_exp = (exp_date - datetime.now()).days
        if days_to_exp > 0:
            return (premium / current_price) * (365 / days_to_exp) * 100
        return 0
    except:
        return (premium / current_price) * 12 * 100  # Fallback: assume monthly

def generate_covered_call_recommendations(historical_data, options_data, portfolio, current_info):
    """Generate covered call recommendations."""
    current_price = current_info['regularMarketPrice']
    rsi = calculate_rsi(historical_data).iloc[-1]
    recommendations = []

    if portfolio.shares >= 100:
        for date, opts in options_data.items():
            for otm_pct in [0.05, 0.075, 0.10]:
                strike = round(current_price * (1 + otm_pct))
                premium = estimate_premium(opts, strike, is_call=True)
                if premium > 0:
                    qty = min(portfolio.shares // 100, 10)
                    total_premium = qty * 100 * premium
                    annualized_yield = _calculate_annualized_yield(premium, current_price, date)
                    
                    recommendations.append({
                        'strategy': 'Covered Calls',
                        'action': 'Sell Covered Call',
                        'expiration': date,
                        'strike': strike,
                        'premium': round(premium, 2),
                        'qty': qty,
                        'total_premium': round(total_premium, 2),
                        'annualized_yield_pct': round(annualized_yield, 2),
                        'rationale': f"Generate income ({otm_pct*100:.1f}% OTM, RSI {rsi:.1f})"
                    })
    return recommendations

def generate_wheel_strategy_recommendations(historical_data, options_data, portfolio, current_info):
    """Generate Wheel Strategy recommendations: Cash-secured puts + covered calls after assignment."""
    current_price = current_info['regularMarketPrice']
    ma50 = calculate_moving_average(historical_data).iloc[-1]
    rsi = calculate_rsi(historical_data).iloc[-1]
    recommendations = []

    # Wheel Strategy Phase 1: Sell Cash-Secured Puts (best on dips or neutral)
    # This allows accumulating shares at a discount
    for date, opts in options_data.items():
        for otm_pct in WHEEL_PUT_OTM_PCT:
            put_strike = round(current_price * (1 - otm_pct))
            put_premium = estimate_premium(opts, put_strike, is_call=False)
            
            if put_premium > 0:
                # Calculate max contracts based on cash available
                required_cash_per_contract = put_strike * 100 * WHEEL_MIN_CASH_RATIO
                max_contracts = int(portfolio.cash / required_cash_per_contract)
                
                if max_contracts > 0:
                    qty = min(max_contracts, 10)  # Cap at 10 for display
                    total_premium = qty * 100 * put_premium
                    required_cash = put_strike * 100 * qty
                    annualized_yield = _calculate_annualized_yield(put_premium, current_price, date)
                    
                    # Calculate break-even and assignment scenario
                    break_even = put_strike - put_premium
                    assignment_cost = put_strike * 100 * qty
                    net_cost_per_share = break_even
                    
                    recommendations.append({
                        'strategy': 'Wheel Strategy',
                        'action': 'Sell Cash-Secured Put',
                        'expiration': date,
                        'strike': put_strike,
                        'premium': round(put_premium, 2),
                        'qty': qty,
                        'total_premium': round(total_premium, 2),
                        'required_cash': round(required_cash, 2),
                        'break_even_price': round(break_even, 2),
                        'annualized_yield_pct': round(annualized_yield, 2),
                        'rationale': f"Phase 1: Collect premium, acquire shares at {put_strike} if assigned ({otm_pct*100:.1f}% below current, RSI {rsi:.1f})"
                    })
                    
                    # Phase 2: Show covered call opportunity after assignment
                    # This simulates what you'd do after getting assigned
                    if portfolio.shares + (qty * 100) >= 100:
                        # Find a covered call strike (5% OTM from put strike)
                        cc_strike = round(put_strike * 1.05)
                        cc_premium = estimate_premium(opts, cc_strike, is_call=True)
                        
                        if cc_premium > 0:
                            cc_qty = qty  # Same number of contracts
                            cc_total_premium = cc_qty * 100 * cc_premium
                            cc_annualized = _calculate_annualized_yield(cc_premium, put_strike, date)
                            
                            # Total wheel income: put premium + call premium
                            total_wheel_income = total_premium + cc_total_premium
                            total_wheel_yield = ((total_wheel_income / assignment_cost) * 100) if assignment_cost > 0 else 0
                            
                            recommendations.append({
                                'strategy': 'Wheel Strategy',
                                'action': 'After Assignment: Sell Covered Call',
                                'expiration': date,
                                'strike': cc_strike,
                                'premium': round(cc_premium, 2),
                                'qty': cc_qty,
                                'total_premium': round(cc_total_premium, 2),
                                'annualized_yield_pct': round(cc_annualized, 2),
                                'total_wheel_income': round(total_wheel_income, 2),
                                'total_wheel_yield_pct': round(total_wheel_yield, 2),
                                'rationale': f"Phase 2: After assignment at {put_strike}, sell CC at {cc_strike} for additional income"
                            })

    return recommendations

def generate_recommendations(historical_data, options_data, portfolio, current_info):
    """Generate recommendations for all enabled strategies."""
    recommendations = []
    
    # Covered Call Strategy
    if ENABLE_COVERED_CALLS:
        recommendations.extend(generate_covered_call_recommendations(
            historical_data, options_data, portfolio, current_info
        ))
    
    # Wheel Strategy
    if ENABLE_WHEEL_STRATEGY:
        recommendations.extend(generate_wheel_strategy_recommendations(
            historical_data, options_data, portfolio, current_info
        ))
    
    # Additional strategies (buy calls/puts)
    current_price = current_info['regularMarketPrice']
    ma50 = calculate_moving_average(historical_data).iloc[-1]
    rsi = calculate_rsi(historical_data).iloc[-1]

    # Long-term bullish: Favor buying calls if above MA
    if current_price > ma50 and rsi > BULLISH_THRESHOLD:
        for date, opts in options_data.items():
            strike = round(current_price * 1.05)  # 5% OTM call
            premium = estimate_premium(opts, strike, is_call=True)
            qty = risk_adjusted_qty(portfolio.get_value(current_price), premium)
            if qty > 0:
                proj_yield = project_yield(current_price, years=1)  # Mid-term
                recommendations.append({
                    'strategy': 'Speculative',
                    'action': 'Buy Call',
                    'expiration': date,
                    'strike': strike,
                    'premium': round(premium, 2),
                    'qty': qty,
                    'proj_profit': qty * 100 * max(current_price * 1.1 - strike - premium, 0),  # Rough 10% upside
                    'rationale': f"Bullish signal (RSI {rsi:.2f}); mid-term EPS growth to {proj_yield:.2f}% yield"
                })

    # Short-term dip: Favor buying puts
    if rsi < DIP_THRESHOLD:
        for date, opts in options_data.items():
            strike = round(current_price * 0.95)  # 5% OTM put
            premium = estimate_premium(opts, strike, is_call=False)
            qty = risk_adjusted_qty(portfolio.get_value(current_price), premium)
            if qty > 0:
                recommendations.append({
                    'action': 'Buy Put',
                    'expiration': date,
                    'strike': strike,
                    'premium': round(premium, 2),
                    'qty': qty,
                    'proj_profit': qty * 100 * max(strike - current_price * 0.9 - premium, 0),  # Rough 10% downside
                    'rationale': f"Dip detected (RSI {rsi:.2f}); hedge for current volatility, long-term EPS to $11.24 by 2030"
                })

    return recommendations
