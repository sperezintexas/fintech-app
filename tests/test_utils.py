import pytest
import pandas as pd
import numpy as np
from fintech_app.utils import (
    calculate_moving_average,
    calculate_rsi,
    estimate_premium,
    project_yield,
    risk_adjusted_qty
)


class TestCalculateMovingAverage:
    """Unit tests for calculate_moving_average function."""

    def test_moving_average_basic(self):
        """Test moving average calculation with simple data."""
        dates = pd.date_range('2024-01-01', periods=100, freq='D')
        prices = pd.Series(range(100, 200), index=dates)
        data = pd.DataFrame({'Close': prices})
        
        ma = calculate_moving_average(data, window=50)
        
        assert len(ma) == 100
        assert pd.isna(ma.iloc[0:49]).all()  # First 49 should be NaN
        assert not pd.isna(ma.iloc[49:]).any()  # Rest should have values
        assert ma.iloc[49] == pytest.approx(124.5, abs=0.1)  # Average of 100-149

    def test_moving_average_custom_window(self):
        """Test moving average with custom window size."""
        dates = pd.date_range('2024-01-01', periods=30, freq='D')
        prices = pd.Series(range(1, 31), index=dates)
        data = pd.DataFrame({'Close': prices})
        
        ma = calculate_moving_average(data, window=10)
        
        assert len(ma) == 30
        assert pd.isna(ma.iloc[0:9]).all()
        assert not pd.isna(ma.iloc[9:]).any()


class TestCalculateRSI:
    """Unit tests for calculate_rsi function."""

    def test_rsi_rising_prices(self):
        """Test RSI calculation with consistently rising prices (should be > 50)."""
        dates = pd.date_range('2024-01-01', periods=30, freq='D')
        # Rising prices
        prices = pd.Series([100 + i * 2 for i in range(30)], index=dates)
        data = pd.DataFrame({'Close': prices})
        
        rsi = calculate_rsi(data, period=14)
        
        # RSI should be calculated for last values
        last_rsi = rsi.iloc[-1]
        assert not pd.isna(last_rsi)
        assert last_rsi > 50  # Rising prices = bullish RSI

    def test_rsi_falling_prices(self):
        """Test RSI calculation with consistently falling prices (should be < 50)."""
        dates = pd.date_range('2024-01-01', periods=30, freq='D')
        # Falling prices
        prices = pd.Series([200 - i * 2 for i in range(30)], index=dates)
        data = pd.DataFrame({'Close': prices})
        
        rsi = calculate_rsi(data, period=14)
        
        last_rsi = rsi.iloc[-1]
        assert not pd.isna(last_rsi)
        assert last_rsi < 50  # Falling prices = bearish RSI

    def test_rsi_range(self):
        """Test that RSI values are in valid range (0-100)."""
        dates = pd.date_range('2024-01-01', periods=30, freq='D')
        prices = pd.Series([100 + np.sin(i) * 10 for i in range(30)], index=dates)
        data = pd.DataFrame({'Close': prices})
        
        rsi = calculate_rsi(data, period=14)
        valid_rsi = rsi.dropna()
        
        assert (valid_rsi >= 0).all()
        assert (valid_rsi <= 100).all()


class TestEstimatePremium:
    """Unit tests for estimate_premium function."""

    def test_estimate_premium_call_exact_match(self):
        """Test premium estimation with exact strike match."""
        option_data = {
            'calls': pd.DataFrame({
                'strike': [200, 210, 220, 230],
                'lastPrice': [10.0, 8.0, 6.0, 4.0]
            }),
            'puts': pd.DataFrame({
                'strike': [200, 210, 220, 230],
                'lastPrice': [2.0, 3.0, 4.0, 5.0]
            })
        }
        
        premium = estimate_premium(option_data, strike=210, is_call=True)
        assert premium == 8.0

    def test_estimate_premium_call_closest_match(self):
        """Test premium estimation with closest strike match."""
        option_data = {
            'calls': pd.DataFrame({
                'strike': [200, 210, 220, 230],
                'lastPrice': [10.0, 8.0, 6.0, 4.0]
            }),
            'puts': pd.DataFrame({
                'strike': [200, 210, 220, 230],
                'lastPrice': [2.0, 3.0, 4.0, 5.0]
            })
        }
        
        premium = estimate_premium(option_data, strike=215, is_call=True)
        assert premium == 8.0  # Closest to 210

    def test_estimate_premium_put(self):
        """Test premium estimation for put options."""
        option_data = {
            'calls': pd.DataFrame({
                'strike': [200, 210, 220],
                'lastPrice': [10.0, 8.0, 6.0]
            }),
            'puts': pd.DataFrame({
                'strike': [200, 210, 220],
                'lastPrice': [2.0, 3.0, 4.0]
            })
        }
        
        premium = estimate_premium(option_data, strike=210, is_call=False)
        assert premium == 3.0

    def test_estimate_premium_empty_dataframe(self):
        """Test premium estimation with empty option data."""
        option_data = {
            'calls': pd.DataFrame(columns=['strike', 'lastPrice']),
            'puts': pd.DataFrame(columns=['strike', 'lastPrice'])
        }
        
        premium = estimate_premium(option_data, strike=210, is_call=True)
        assert premium == 0


class TestProjectYield:
    """Unit tests for project_yield function."""

    def test_project_yield_basic(self):
        """Test yield projection with default parameters."""
        current_price = 200.0
        yield_pct = project_yield(current_price, eps_growth_rate=0.33, years=5)
        
        # Should return a positive yield percentage
        assert isinstance(yield_pct, (int, float))
        assert yield_pct > 0

    def test_project_yield_different_years(self):
        """Test yield projection with different time horizons."""
        current_price = 200.0
        
        yield_1yr = project_yield(current_price, years=1)
        yield_5yr = project_yield(current_price, years=5)
        
        # Longer horizon should generally have different yield
        assert isinstance(yield_1yr, (int, float))
        assert isinstance(yield_5yr, (int, float))

    def test_project_yield_different_growth_rates(self):
        """Test yield projection with different growth rates."""
        current_price = 200.0
        
        yield_low = project_yield(current_price, eps_growth_rate=0.1, years=5)
        yield_high = project_yield(current_price, eps_growth_rate=0.5, years=5)
        
        assert isinstance(yield_low, (int, float))
        assert isinstance(yield_high, (int, float))


class TestRiskAdjustedQty:
    """Unit tests for risk_adjusted_qty function."""

    def test_risk_adjusted_qty_basic(self):
        """Test risk-adjusted quantity calculation."""
        portfolio_value = 100000
        premium = 5.0
        qty = risk_adjusted_qty(portfolio_value, premium)
        
        # Should return integer
        assert isinstance(qty, int)
        # With 5% risk tolerance: (100000 * 0.05) / (5.0 * 100) = 10
        assert qty == 10

    def test_risk_adjusted_qty_custom_tolerance(self):
        """Test risk-adjusted quantity with custom risk tolerance."""
        portfolio_value = 100000
        premium = 5.0
        qty = risk_adjusted_qty(portfolio_value, premium, risk_tolerance=0.10)
        
        # With 10% risk tolerance: (100000 * 0.10) / (5.0 * 100) = 20
        assert qty == 20

    def test_risk_adjusted_qty_high_premium(self):
        """Test risk-adjusted quantity with high premium (should return 0 or small number)."""
        portfolio_value = 10000
        premium = 100.0
        qty = risk_adjusted_qty(portfolio_value, premium)
        
        # With 5% risk tolerance: (10000 * 0.05) / (100.0 * 100) = 0.05 -> 0
        assert qty == 0

    def test_risk_adjusted_qty_zero_premium(self):
        """Test risk-adjusted quantity with zero premium (should handle gracefully)."""
        portfolio_value = 100000
        premium = 0.0
        
        # Should handle division by zero or return 0
        qty = risk_adjusted_qty(portfolio_value, premium)
        assert isinstance(qty, int)
