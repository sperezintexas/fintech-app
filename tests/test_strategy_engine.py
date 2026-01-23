import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from fintech_app.strategy_engine import generate_recommendations
from fintech_app.portfolio import Portfolio


class TestStrategyEngine:
    """Unit tests for strategy_engine module."""

    def create_mock_historical_data(self, current_price=200.0, ma50=190.0):
        """Helper to create mock historical data."""
        dates = pd.date_range('2024-01-01', periods=100, freq='D')
        prices = pd.Series([current_price] * 100, index=dates)
        return pd.DataFrame({'Close': prices})

    def create_mock_options_data(self):
        """Helper to create mock options data."""
        return {
            '2024-02-01': {
                'calls': pd.DataFrame({
                    'strike': [200, 210, 220],
                    'lastPrice': [10.0, 8.0, 6.0]
                }),
                'puts': pd.DataFrame({
                    'strike': [180, 190, 200],
                    'lastPrice': [2.0, 3.0, 4.0]
                })
            }
        }

    def create_mock_info(self, price=200.0):
        """Helper to create mock current info."""
        return {'regularMarketPrice': price}

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    @patch('fintech_app.strategy_engine.estimate_premium')
    @patch('fintech_app.strategy_engine.risk_adjusted_qty')
    @patch('fintech_app.strategy_engine.project_yield')
    def test_bullish_recommendation(
        self, mock_project_yield, mock_risk_qty, mock_premium,
        mock_rsi, mock_ma
    ):
        """Test recommendation generation for bullish conditions."""
        # Setup mocks
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)  # Price > MA
        mock_rsi.return_value = pd.Series([60.0] * 100)  # RSI > 50 (bullish)
        mock_premium.return_value = 8.0
        mock_risk_qty.return_value = 5
        mock_project_yield.return_value = 15.0

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=500, cash=10000, use_db=False)
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        assert len(recs) > 0
        assert any(r['action'] == 'Buy Call' for r in recs)
        call_rec = next(r for r in recs if r['action'] == 'Buy Call')
        assert call_rec['strike'] == round(200.0 * 1.05)  # 5% OTM
        assert call_rec['premium'] == 8.0
        assert call_rec['qty'] == 5

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    @patch('fintech_app.strategy_engine.estimate_premium')
    @patch('fintech_app.strategy_engine.risk_adjusted_qty')
    def test_dip_recommendation(
        self, mock_risk_qty, mock_premium, mock_rsi, mock_ma
    ):
        """Test recommendation generation for dip conditions."""
        # Setup mocks
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)
        mock_rsi.return_value = pd.Series([25.0] * 100)  # RSI < 30 (dip)
        mock_premium.return_value = 3.0
        mock_risk_qty.return_value = 3

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=500, cash=10000, use_db=False)
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        assert len(recs) > 0
        assert any(r['action'] == 'Buy Put' for r in recs)
        put_rec = next(r for r in recs if r['action'] == 'Buy Put')
        assert put_rec['strike'] == round(200.0 * 0.95)  # 5% OTM below

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    @patch('fintech_app.strategy_engine.estimate_premium')
    def test_covered_call_recommendation(
        self, mock_premium, mock_rsi, mock_ma
    ):
        """Test covered call recommendation during dip."""
        # Setup mocks
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)
        mock_rsi.return_value = pd.Series([25.0] * 100)  # RSI < 30 (dip)
        mock_premium.return_value = 5.0

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=500, cash=10000, use_db=False)  # Has enough shares
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        # Should have both put and covered call recommendations
        assert any(r['action'] == 'Sell Covered Call' for r in recs)
        cc_rec = next(r for r in recs if r['action'] == 'Sell Covered Call')
        assert cc_rec['qty'] == 500 // 100  # 5 contracts
        assert cc_rec['premium'] == 5.0

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    @patch('fintech_app.strategy_engine.estimate_premium')
    def test_covered_calls_in_neutral_market(
        self, mock_premium, mock_rsi, mock_ma
    ):
        """Test that covered calls are shown even in neutral market conditions."""
        # Setup mocks - neutral conditions
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)
        mock_rsi.return_value = pd.Series([40.0] * 100)  # RSI between thresholds (neutral)
        mock_premium.return_value = 8.0

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=500, cash=10000, use_db=False)  # Has shares
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        # Should have covered call recommendations even in neutral market
        assert len(recs) > 0
        assert any(r['action'] == 'Sell Covered Call' for r in recs)
        # Should not have buy call or buy put recommendations in neutral market
        assert not any(r['action'] == 'Buy Call' for r in recs)
        assert not any(r['action'] == 'Buy Put' for r in recs)

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    @patch('fintech_app.strategy_engine.estimate_premium')
    @patch('fintech_app.strategy_engine.risk_adjusted_qty')
    def test_no_recommendation_when_qty_zero(
        self, mock_risk_qty, mock_premium, mock_rsi, mock_ma
    ):
        """Test that no recommendation is generated when risk-adjusted qty is 0."""
        # Setup mocks
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)
        mock_rsi.return_value = pd.Series([60.0] * 100)  # Bullish
        mock_premium.return_value = 8.0
        mock_risk_qty.return_value = 0  # No quantity available

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=500, cash=10000, use_db=False)
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        # Should not have call recommendations when qty is 0
        assert not any(r['action'] == 'Buy Call' for r in recs)

    @patch('fintech_app.strategy_engine.calculate_moving_average')
    @patch('fintech_app.strategy_engine.calculate_rsi')
    def test_covered_call_requires_minimum_shares(
        self, mock_rsi, mock_ma
    ):
        """Test that covered call requires at least 100 shares."""
        # Setup mocks
        historical_data = self.create_mock_historical_data(current_price=200.0)
        mock_ma.return_value = pd.Series([190.0] * 100)
        mock_rsi.return_value = pd.Series([25.0] * 100)  # Dip

        options_data = self.create_mock_options_data()
        portfolio = Portfolio(shares=50, cash=10000, use_db=False)  # Less than 100 shares
        info = self.create_mock_info(price=200.0)

        recs = generate_recommendations(historical_data, options_data, portfolio, info)

        # Should not have covered call recommendation
        assert not any(r['action'] == 'Sell Covered Call' for r in recs)
