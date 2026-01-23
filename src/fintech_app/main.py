from .data_fetcher import fetch_symbol_data as fetch_tsla_data
from .portfolio import Portfolio
from tabulate import tabulate
import pandas as pd

def main():
    # Fetch data (with caching)
    from .config import OPTIONS_MIN_WEEKS, OPTIONS_MAX_WEEKS
    historical_data, options_data, info = fetch_tsla_data("TSLA",
        min_weeks=OPTIONS_MIN_WEEKS,
        max_weeks=OPTIONS_MAX_WEEKS
    )
    
    # Initialize portfolio
    portfolio = Portfolio()
    
    # Show current market conditions
    from .utils import calculate_moving_average, calculate_rsi
    current_price = info['regularMarketPrice']
    ma50 = calculate_moving_average(historical_data).iloc[-1]
    rsi = calculate_rsi(historical_data).iloc[-1]
    
    print(f"\n📊 Current Market Conditions:")
    print(f"   Price: ${current_price:.2f}")
    print(f"   50-day MA: ${ma50:.2f}")
    print(f"   RSI: {rsi:.2f}")
    print(f"   Portfolio: {portfolio.shares} shares, ${portfolio.cash:,.2f} cash")
    print(f"   Options Filter: {OPTIONS_MIN_WEEKS}-{OPTIONS_MAX_WEEKS} weeks expiration ({len(options_data)} expirations found)\n")
    
    # Print options chain (recent expirations only)
    print("\n" + "=" * 80)
    print("OPTIONS CHAIN (AT/NEAR THE MONEY, 1–4 WEEKS)")
    print("=" * 80)
    near_money_pct = 0.03  # +/-3% around current price

    def _rationale(strike: float, base: float, rsi_val: float, is_call: bool) -> str:
        otm_pct = ((strike - base) / base) * 100 if is_call else ((base - strike) / base) * 100
        if is_call:
            if otm_pct >= 0:
                return f"Generate income ({otm_pct:.1f}% OTM, RSI {rsi_val:.1f})"
            return f"ITM call ({otm_pct:.1f}% ITM, RSI {rsi_val:.1f})"
        if otm_pct >= 0:
            return f"Wheel strategy ({otm_pct:.1f}% OTM, RSI {rsi_val:.1f})"
        return f"ITM put ({otm_pct:.1f}% ITM, RSI {rsi_val:.1f})"

    for exp_date, opts in options_data.items():
        print(f"\n📅 Expiration: {exp_date}")

        calls_df = opts.get("calls", pd.DataFrame()).copy()
        puts_df = opts.get("puts", pd.DataFrame()).copy()

        calls_filtered = pd.DataFrame()
        puts_filtered = pd.DataFrame()

        if not calls_df.empty and "strike" in calls_df.columns:
            calls_filtered = calls_df[
                (calls_df["strike"] >= current_price * (1 - near_money_pct)) &
                (calls_df["strike"] <= current_price * (1 + near_money_pct))
            ].copy()

        if not puts_df.empty and "strike" in puts_df.columns:
            puts_filtered = puts_df[
                (puts_df["strike"] >= current_price * (1 - near_money_pct)) &
                (puts_df["strike"] <= current_price * (1 + near_money_pct))
            ].copy()

        if calls_filtered.empty and puts_filtered.empty:
            print("\nNo calls/puts near the money for this expiration.")
            continue

        # Build merged table with strike in the middle
        call_cols = ["strike", "lastPrice", "bid", "ask", "volume"]
        put_cols = ["strike", "lastPrice", "bid", "ask", "volume"]

        calls_view = calls_filtered[[c for c in call_cols if c in calls_filtered.columns]].copy()
        puts_view = puts_filtered[[c for c in put_cols if c in puts_filtered.columns]].copy()

        calls_view = calls_view.rename(columns={
            "lastPrice": "call_last",
            "bid": "call_bid",
            "ask": "call_ask",
            "volume": "call_vol"
        })
        puts_view = puts_view.rename(columns={
            "lastPrice": "put_last",
            "bid": "put_bid",
            "ask": "put_ask",
            "volume": "put_vol"
        })

        if not calls_view.empty:
            calls_view["call_rationale"] = calls_view["strike"].apply(
                lambda s: _rationale(float(s), current_price, rsi, True)
            )
        if not puts_view.empty:
            puts_view["put_rationale"] = puts_view["strike"].apply(
                lambda s: _rationale(float(s), current_price, rsi, False)
            )

        merged = pd.merge(
            calls_view,
            puts_view,
            on="strike",
            how="outer"
        )

        merged = merged.sort_values("strike")
        display_cols = [
            "call_last", "call_bid", "call_ask", "call_vol", "call_rationale",
            "strike",
            "put_last", "put_bid", "put_ask", "put_vol", "put_rationale"
        ]
        available_cols = [col for col in display_cols if col in merged.columns]
        print(tabulate(merged[available_cols], headers="keys", tablefmt="pretty", floatfmt=".2f", showindex=False))
    
    # No interactive prompt; console output only.
    
    # Extension idea: Add loop for monitoring
    # while True:
    #     # Refetch data every 5min, regenerate recs
    #     time.sleep(300)

if __name__ == "__main__":
    main()
