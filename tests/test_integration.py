import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from fintech_app.main import main
from fintech_app.portfolio import Portfolio
from fintech_app.strategy_engine import generate_recommendations
from fintech_app.data_fetcher import fetch_symbol_data as fetch_tsla_data


class TestIntegration:
    """Integration tests for the full application workflow."""

    def create_mock_data(self):
        """Helper to create complete mock data for integration tests."""
        # Historical data
        dates = pd.date_range('2024-01-01', periods=100, freq='D')
        historical_data = pd.DataFrame({
            'Close': [200.0 + i * 0.5 for i in range(100)],
            'Open': [199.0 + i * 0.5 for i in range(100)],
            'High': [201.0 + i * 0.5 for i in range(100)],
            'Low': [198.0 + i * 0.5 for i in range(100)],
            'Volume': [1000000] * 100
        }, index=dates)

        # Options data
        options_data = {
            '2024-02-01': {
                'calls': pd.DataFrame({
                    'strike': [200, 210, 220, 230],
                    'lastPrice': [10.0, 8.0, 6.0, 4.0]
                }),
                'puts': pd.DataFrame({
                    'strike': [170, 180, 190, 200],
                    'lastPrice': [2.0, 3.0, 4.0, 5.0]
                })
            },
            '2024-03-01': {
                'calls': pd.DataFrame({
                    'strike': [200, 210, 220],
                    'lastPrice': [12.0, 10.0, 8.0]
                }),
                'puts': pd.DataFrame({
                    'strike': [180, 190, 200],
                    'lastPrice': [3.0, 4.0, 5.0]
                })
            }
        }

        # Info
        info = {
            'regularMarketPrice': 200.0,
            'marketCap': 600000000000,
            'volume': 50000000,
            'trailingPE': 50.0
        }

        return historical_data, options_data, info

    @patch('fintech_app.main.fetch_tsla_data')
    @patch('fintech_app.main.input', return_value='no')
    def test_main_workflow_no_recommendations(self, mock_input, mock_fetch):
        """Test main workflow when no recommendations are generated."""
        historical_data, options_data, info = self.create_mock_data()
        mock_fetch.return_value = (historical_data, options_data, info)

        # Mock utils to return neutral conditions
        with patch('fintech_app.strategy_engine.calculate_moving_average') as mock_ma, \
             patch('fintech_app.strategy_engine.calculate_rsi') as mock_rsi:
            mock_ma.return_value = pd.Series([190.0] * 100)
            mock_rsi.return_value = pd.Series([40.0] * 100)  # Neutral RSI

            # Should not raise any exceptions
            main()

    @patch('fintech_app.main.fetch_tsla_data')
    @patch('fintech_app.main.input', return_value='no')
    def test_main_workflow_with_recommendations(self, mock_input, mock_fetch):
        """Test main workflow when recommendations are generated."""
        historical_data, options_data, info = self.create_mock_data()
        mock_fetch.return_value = (historical_data, options_data, info)

        # Mock utils to return bullish conditions
        with patch('fintech_app.strategy_engine.calculate_moving_average') as mock_ma, \
             patch('fintech_app.strategy_engine.calculate_rsi') as mock_rsi, \
             patch('fintech_app.strategy_engine.estimate_premium') as mock_premium, \
             patch('fintech_app.strategy_engine.risk_adjusted_qty') as mock_qty, \
             patch('fintech_app.strategy_engine.project_yield') as mock_yield:
            mock_ma.return_value = pd.Series([190.0] * 100)
            mock_rsi.return_value = pd.Series([60.0] * 100)  # Bullish
            mock_premium.return_value = 8.0
            mock_qty.return_value = 5
            mock_yield.return_value = 15.0

            # Should not raise any exceptions
            main()

    @patch('fintech_app.main.fetch_tsla_data')
    @patch('fintech_app.main.input', return_value='600')
    def test_main_workflow_update_shares(self, mock_input, mock_fetch):
        """Test main workflow with share update."""
        historical_data, options_data, info = self.create_mock_data()
        mock_fetch.return_value = (historical_data, options_data, info)

        with patch('fintech_app.strategy_engine.calculate_moving_average') as mock_ma, \
             patch('fintech_app.strategy_engine.calculate_rsi') as mock_rsi:
            mock_ma.return_value = pd.Series([190.0] * 100)
            mock_rsi.return_value = pd.Series([40.0] * 100)

            # Should not raise any exceptions
            main()

    def test_portfolio_to_strategy_integration(self):
        """Test integration between Portfolio and strategy engine."""
        portfolio = Portfolio(shares=500, cash=10000)
        historical_data, options_data, info = self.create_mock_data()

        # Mock utils
        with patch('fintech_app.strategy_engine.calculate_moving_average') as mock_ma, \
             patch('fintech_app.strategy_engine.calculate_rsi') as mock_rsi, \
             patch('fintech_app.strategy_engine.estimate_premium') as mock_premium, \
             patch('fintech_app.strategy_engine.risk_adjusted_qty') as mock_qty, \
             patch('fintech_app.strategy_engine.project_yield') as mock_yield:
            mock_ma.return_value = pd.Series([190.0] * 100)
            mock_rsi.return_value = pd.Series([60.0] * 100)  # Bullish
            mock_premium.return_value = 8.0
            mock_qty.return_value = 5
            mock_yield.return_value = 15.0

            recs = generate_recommendations(historical_data, options_data, portfolio, info)

            # Portfolio value should be used in calculations
            portfolio_value = portfolio.get_value(info['regularMarketPrice'])
            assert portfolio_value > 0
            assert isinstance(recs, list)

    def test_data_fetcher_to_strategy_integration(self):
        """Test integration between data fetcher and strategy engine."""
        historical_data, options_data, info = self.create_mock_data()
        portfolio = Portfolio()

        # Mock utils
        with patch('fintech_app.strategy_engine.calculate_moving_average') as mock_ma, \
             patch('fintech_app.strategy_engine.calculate_rsi') as mock_rsi, \
             patch('fintech_app.strategy_engine.estimate_premium') as mock_premium, \
             patch('fintech_app.strategy_engine.risk_adjusted_qty') as mock_qty, \
             patch('fintech_app.strategy_engine.project_yield') as mock_yield:
            mock_ma.return_value = pd.Series([190.0] * 100)
            mock_rsi.return_value = pd.Series([25.0] * 100)  # Dip
            mock_premium.return_value = 3.0
            mock_qty.return_value = 3
            mock_yield.return_value = 10.0

            recs = generate_recommendations(historical_data, options_data, portfolio, info)

            # Should work with fetched data structure
            assert isinstance(recs, list)
            assert 'regularMarketPrice' in info
            assert len(historical_data) > 0
            assert len(options_data) > 0
