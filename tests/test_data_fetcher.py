import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from fintech_app.data_fetcher import fetch_symbol_data as fetch_tsla_data, cache_data


class TestDataFetcher:
    """Unit tests for data_fetcher module."""

    @patch('fintech_app.data_fetcher.yf.Ticker')
    def test_fetch_tsla_data_success(self, mock_ticker_class):
        """Test successful data fetching."""
        # Setup mock
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker

        # Mock historical data
        dates = pd.date_range('2024-01-01', periods=100, freq='D')
        mock_historical = pd.DataFrame({
            'Close': [200.0] * 100,
            'Open': [199.0] * 100,
            'High': [201.0] * 100,
            'Low': [198.0] * 100,
            'Volume': [1000000] * 100
        }, index=dates)
        mock_ticker.history.return_value = mock_historical

        # Mock options - use dates in 4-8 week range from today
        from datetime import datetime, timedelta
        today = datetime.now().date()
        date1 = (today + timedelta(weeks=5)).strftime('%Y-%m-%d')
        date2 = (today + timedelta(weeks=6)).strftime('%Y-%m-%d')
        date3 = (today + timedelta(weeks=7)).strftime('%Y-%m-%d')
        
        mock_ticker.options = [date1, date2, date3]
        mock_chain = MagicMock()
        mock_chain.calls = pd.DataFrame({
            'strike': [200, 210, 220],
            'lastPrice': [10.0, 8.0, 6.0]
        })
        mock_chain.puts = pd.DataFrame({
            'strike': [180, 190, 200],
            'lastPrice': [2.0, 3.0, 4.0]
        })
        mock_ticker.option_chain.return_value = mock_chain

        # Mock info
        mock_ticker.info = {
            'regularMarketPrice': 200.0,
            'marketCap': 600000000000,
            'volume': 50000000
        }

        # Execute
        historical_data, options_data, info = fetch_tsla_data()

        # Assert
        assert isinstance(historical_data, pd.DataFrame)
        assert len(historical_data) == 100
        assert isinstance(options_data, dict)
        assert len(options_data) == 3  # All 3 dates are in 4-8 week range
        assert date1 in options_data
        assert 'calls' in options_data[date1]
        assert 'puts' in options_data[date1]
        assert info['regularMarketPrice'] == 200.0

    @patch('fintech_app.data_fetcher.yf.Ticker')
    def test_fetch_tsla_data_custom_period(self, mock_ticker_class):
        """Test data fetching with custom period."""
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker

        dates = pd.date_range('2024-01-01', periods=30, freq='D')
        mock_historical = pd.DataFrame({
            'Close': [200.0] * 30
        }, index=dates)
        mock_ticker.history.return_value = mock_historical
        mock_ticker.options = []
        mock_ticker.info = {'regularMarketPrice': 200.0}

        historical_data, options_data, info = fetch_tsla_data(period="1mo", interval="1d")

        mock_ticker.history.assert_called_once_with(period="1mo", interval="1d")
        assert isinstance(historical_data, pd.DataFrame)

    @patch('fintech_app.data_fetcher.yf.Ticker')
    def test_fetch_tsla_data_no_options(self, mock_ticker_class):
        """Test data fetching when no options are available."""
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker

        dates = pd.date_range('2024-01-01', periods=100, freq='D')
        mock_historical = pd.DataFrame({'Close': [200.0] * 100}, index=dates)
        mock_ticker.history.return_value = mock_historical
        mock_ticker.options = []  # No options
        mock_ticker.info = {'regularMarketPrice': 200.0}

        historical_data, options_data, info = fetch_tsla_data()

        assert isinstance(historical_data, pd.DataFrame)
        assert options_data == {}  # Empty dict when no options

    def test_cache_data(self, tmp_path):
        """Test data caching functionality."""
        dates = pd.date_range('2024-01-01', periods=10, freq='D')
        test_data = pd.DataFrame({
            'Close': [200.0] * 10,
            'Open': [199.0] * 10
        }, index=dates)

        cache_file = tmp_path / "test_cache.csv"
        cached = cache_data(test_data, filename=str(cache_file))

        assert isinstance(cached, pd.DataFrame)
        assert cache_file.exists()
        
        # Verify data can be read back
        loaded = pd.read_csv(cache_file, index_col=0, parse_dates=True)
        assert len(loaded) == 10
