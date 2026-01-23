# covered_call_monitor_mvp.py
# Requirements: pip install yfinance pandas tabulate

import yfinance as yf
from datetime import datetime, date
from tabulate import tabulate
import warnings
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Tuple

warnings.filterwarnings("ignore", category=FutureWarning)  # yfinance warnings cleanup

# === CONFIG - Customize here ===
SYMBOL = "TSLA"
STRIKE = 475.0
EXPIRATION_DATE = date(2026, 1, 30)   # Jan 30, 2026
CONTRACTS = 2                         # your short calls
ORIGINAL_CREDIT_PER_SHARE = 3.15      # approx your avg fill (update with exact)

# === Helper functions ===
def days_to_expiration(exp_date):
    today = date.today()
    return (exp_date - today).days

def get_tsla_data():
    ticker = yf.Ticker(SYMBOL)
    
    # Current stock price
    stock_info = ticker.info
    current_price = stock_info.get('regularMarketPrice') or stock_info.get('currentPrice')
    if current_price is None:
        current_price = ticker.history(period="1d")['Close'].iloc[-1]
    
    # Options chain for the expiration
    try:
        opt = ticker.option_chain(EXPIRATION_DATE.strftime("%Y-%m-%d"))
        calls = opt.calls
        target_call = calls[calls['strike'] == STRIKE]
        
        if target_call.empty:
            print(f"Warning: No data found for strike {STRIKE}")
            return current_price, None, None, None
        
        row = target_call.iloc[0]
        bid = row['bid']
        ask = row['ask']
        last = row['lastPrice']
        mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
        volume = row['volume']
        open_interest = row['openInterest']
        
        return (
            current_price,
            {'bid': bid, 'ask': ask, 'last': last, 'mid': mid},
            volume,
            open_interest
        )
    
    except Exception as e:
        print(f"Error fetching options chain: {e}")
        return current_price, None, None, None

def calculate_status(current_price, opt_data):
    if opt_data is None:
        return "N/A", "N/A", "N/A"
    
    distance_to_strike_pct = (STRIKE - current_price) / current_price * 100
    current_mid = opt_data['mid']
    
    # Rough unrealized P/L on short call (per share)
    # Positive = profit (premium decayed), Negative = paper loss
    pnl_per_share = ORIGINAL_CREDIT_PER_SHARE - current_mid
    pnl_total = pnl_per_share * 100 * CONTRACTS  # for 2 contracts
    
    return (
        f"{distance_to_strike_pct:.2f}% OTM" if distance_to_strike_pct > 0 else f"{abs(distance_to_strike_pct):.2f}% ITM",
        f"${current_mid:.2f} (bid ${opt_data['bid']:.2f} / ask ${opt_data['ask']:.2f})",
        f"${pnl_per_share:.2f} per share | ${pnl_total:,.0f} total (unrealized)"
    )

def send_email_alert(
    smtp_server: str,
    smtp_port: int,
    sender_email: str,
    sender_password: str,
    recipient_email: str,
    subject: str,
    body: str
) -> bool:
    """Send email alert using SMTP."""
    try:
        msg = MIMEMultipart()
        msg['From'] = sender_email
        msg['To'] = recipient_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'plain'))
        
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False

def check_alert_conditions(current_price: float, dte: int, price_threshold: float = 460.0, dte_threshold: int = 7) -> Tuple[bool, list]:
    """Check if alert conditions are met. Returns (should_alert, reasons)."""
    reasons = []
    should_alert = False
    
    if current_price > price_threshold:
        should_alert = True
        reasons.append(f"Stock price ${current_price:,.2f} > ${price_threshold:,.2f}")
    
    if dte < dte_threshold:
        should_alert = True
        reasons.append(f"Days to expiration ({dte}) < {dte_threshold}")
    
    return should_alert, reasons

def get_monitor_data() -> Dict:
    """Get all monitor data and return as dictionary."""
    current_price, opt_data, vol, oi = get_tsla_data()
    dte = days_to_expiration(EXPIRATION_DATE)
    status, premium_str, pnl_str = calculate_status(current_price, opt_data)
    
    should_alert, alert_reasons = check_alert_conditions(current_price, dte)
    
    roll_alert = "YES - near strike" if current_price > STRIKE * 0.95 else "Monitor" if current_price > STRIKE * 0.85 else "No action needed"
    
    return {
        'current_price': current_price,
        'dte': dte,
        'strike': STRIKE,
        'status': status,
        'premium_str': premium_str,
        'volume': vol,
        'open_interest': oi,
        'pnl_str': pnl_str,
        'roll_alert': roll_alert,
        'opt_data': opt_data,
        'should_alert': should_alert,
        'alert_reasons': alert_reasons
    }

def print_monitor_table():
    """Print monitor table to console."""
    data = get_monitor_data()
    
    table = [
        ["TSLA Current Price", f"${data['current_price']:,.2f}"],
        ["Days to Expiration", f"{data['dte']} days"],
        ["Strike", f"${data['strike']:,.2f}"],
        ["Status (to strike)", data['status']],
        ["Call Premium (mid)", data['premium_str']],
        ["Volume / OI", f"{data['volume']:,} / {data['open_interest']:,}" if data['volume'] is not None else "N/A"],
        ["Unrealized P/L on short calls", data['pnl_str']],
        ["Roll Alert?", data['roll_alert']],
        ["Email Alert?", "YES" if data['should_alert'] else "No"]
    ]
    
    if data['should_alert']:
        table.append(["Alert Reasons", "; ".join(data['alert_reasons'])])
    
    print(f"\n=== TSLA Covered Call Monitor - {datetime.now().strftime('%Y-%m-%d %I:%M %p CST')} ===")
    print(tabulate(table, headers=["Metric", "Value"], tablefmt="grid"))
    print("\nNote: Run near 3:00 PM CST daily. Update ORIGINAL_CREDIT_PER_SHARE with your exact avg fill.")
    print("If stock nears $460–475 or DTE <10, consider rolling up/out for fresh premium.")

def send_monitor_alert(
    smtp_server: str,
    smtp_port: int,
    sender_email: str,
    sender_password: str,
    recipient_email: str
) -> bool:
    """Check conditions and send email alert if needed."""
    data = get_monitor_data()
    
    if not data['should_alert']:
        return False
    
    subject = f"🚨 TSLA Covered Call Alert - {datetime.now().strftime('%Y-%m-%d %I:%M %p')}"
    
    body = f"""
TSLA Covered Call Monitor Alert

Alert Conditions Met:
{chr(10).join('- ' + reason for reason in data['alert_reasons'])}

Current Status:
- TSLA Price: ${data['current_price']:,.2f}
- Days to Expiration: {data['dte']} days
- Strike: ${data['strike']:,.2f}
- Status: {data['status']}
- Call Premium: {data['premium_str']}
- Unrealized P/L: {data['pnl_str']}
- Roll Alert: {data['roll_alert']}

Action Recommended:
Consider rolling up/out for fresh premium if stock nears strike or DTE is low.

Generated: {datetime.now().strftime('%Y-%m-%d %I:%M %p CST')}
"""
    
    return send_email_alert(
        smtp_server, smtp_port, sender_email, sender_password,
        recipient_email, subject, body
    )

if __name__ == "__main__":
    print_monitor_table()