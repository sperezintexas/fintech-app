"""
Tests for covered_call_monitor module
"""
import pytest
import pandas as pd
from unittest.mock import patch, MagicMock, Mock
from datetime import date, datetime, timedelta
from fintech_app.covered_call_monitor import (
    days_to_expiration,
    calculate_status,
    check_alert_conditions,
    send_email_alert,
    get_monitor_data,
    send_monitor_alert,
    get_tsla_data
)


class TestDaysToExpiration:
    """Tests for days_to_expiration function."""
    
    def test_days_to_expiration_future_date(self):
        """Test calculation for future expiration date."""
        future_date = date.today() + timedelta(days=10)
        result = days_to_expiration(future_date)
        assert result == 10
    
    def test_days_to_expiration_past_date(self):
        """Test calculation for past expiration date."""
        past_date = date.today() - timedelta(days=5)
        result = days_to_expiration(past_date)
        assert result == -5
    
    def test_days_to_expiration_today(self):
        """Test calculation for today's date."""
        today = date.today()
        result = days_to_expiration(today)
        assert result == 0


class TestCalculateStatus:
    """Tests for calculate_status function."""
    
    def test_calculate_status_otm(self):
        """Test status calculation when option is OTM."""
        current_price = 450.0
        opt_data = {
            'bid': 5.0,
            'ask': 5.5,
            'last': 5.25,
            'mid': 5.25
        }
        # Mock module-level constants
        with patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.ORIGINAL_CREDIT_PER_SHARE', 3.15), \
             patch('fintech_app.covered_call_monitor.CONTRACTS', 2):
            status, premium_str, pnl_str = calculate_status(current_price, opt_data)
            
            assert "OTM" in status
            assert "$5.25" in premium_str
            assert "per share" in pnl_str
    
    def test_calculate_status_itm(self):
        """Test status calculation when option is ITM."""
        current_price = 480.0
        opt_data = {
            'bid': 8.0,
            'ask': 8.5,
            'last': 8.25,
            'mid': 8.25
        }
        with patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.ORIGINAL_CREDIT_PER_SHARE', 3.15), \
             patch('fintech_app.covered_call_monitor.CONTRACTS', 2):
            status, premium_str, pnl_str = calculate_status(current_price, opt_data)
            
            assert "ITM" in status
            assert "$8.25" in premium_str
    
    def test_calculate_status_no_option_data(self):
        """Test status calculation when option data is None."""
        current_price = 450.0
        opt_data = None
        
        status, premium_str, pnl_str = calculate_status(current_price, opt_data)
        
        assert status == "N/A"
        assert premium_str == "N/A"
        assert pnl_str == "N/A"


class TestCheckAlertConditions:
    """Tests for check_alert_conditions function."""
    
    def test_alert_triggered_by_price(self):
        """Test alert triggered when price exceeds threshold."""
        current_price = 465.0
        dte = 10
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        assert should_alert is True
        assert len(reasons) == 1
        assert "$465.00" in reasons[0]
        assert "$460.00" in reasons[0]
    
    def test_alert_triggered_by_dte(self):
        """Test alert triggered when DTE is below threshold."""
        current_price = 450.0
        dte = 5
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        assert should_alert is True
        assert len(reasons) == 1
        assert "5" in reasons[0]
        assert "7" in reasons[0]
    
    def test_alert_triggered_by_both(self):
        """Test alert triggered when both conditions are met."""
        current_price = 465.0
        dte = 5
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        assert should_alert is True
        assert len(reasons) == 2
    
    def test_no_alert_normal_conditions(self):
        """Test no alert when conditions are normal."""
        current_price = 450.0
        dte = 10
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        assert should_alert is False
        assert len(reasons) == 0
    
    def test_alert_price_exactly_at_threshold(self):
        """Test alert when price is exactly at threshold (should not trigger)."""
        current_price = 460.0
        dte = 10
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        # Price must be > threshold, not >=
        assert should_alert is False
    
    def test_alert_dte_exactly_at_threshold(self):
        """Test alert when DTE is exactly at threshold (should not trigger)."""
        current_price = 450.0
        dte = 7
        price_threshold = 460.0
        dte_threshold = 7
        
        should_alert, reasons = check_alert_conditions(
            current_price, dte, price_threshold, dte_threshold
        )
        
        # DTE must be < threshold, not <=
        assert should_alert is False


class TestSendEmailAlert:
    """Tests for send_email_alert function."""
    
    @patch('fintech_app.covered_call_monitor.smtplib.SMTP')
    def test_send_email_alert_success(self, mock_smtp):
        """Test successful email sending."""
        mock_server = MagicMock()
        mock_smtp.return_value.__enter__.return_value = mock_server
        
        result = send_email_alert(
            smtp_server="smtp.gmail.com",
            smtp_port=587,
            sender_email="test@example.com",
            sender_password="password",
            recipient_email="recipient@example.com",
            subject="Test Subject",
            body="Test Body"
        )
        
        assert result is True
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("test@example.com", "password")
        mock_server.send_message.assert_called_once()
    
    @patch('fintech_app.covered_call_monitor.smtplib.SMTP')
    def test_send_email_alert_failure(self, mock_smtp):
        """Test email sending failure."""
        mock_smtp.side_effect = Exception("SMTP Error")
        
        result = send_email_alert(
            smtp_server="smtp.gmail.com",
            smtp_port=587,
            sender_email="test@example.com",
            sender_password="password",
            recipient_email="recipient@example.com",
            subject="Test Subject",
            body="Test Body"
        )
        
        assert result is False


class TestGetMonitorData:
    """Tests for get_monitor_data function."""
    
    @patch('fintech_app.covered_call_monitor.get_tsla_data')
    @patch('fintech_app.covered_call_monitor.days_to_expiration')
    @patch('fintech_app.covered_call_monitor.calculate_status')
    def test_get_monitor_data_success(self, mock_calc_status, mock_dte, mock_get_data):
        """Test successful monitor data retrieval."""
        # Setup mocks
        mock_get_data.return_value = (
            450.0,
            {'bid': 5.0, 'ask': 5.5, 'last': 5.25, 'mid': 5.25},
            1000,
            5000
        )
        mock_dte.return_value = 10
        mock_calc_status.return_value = (
            "5.56% OTM",
            "$5.25 (bid $5.00 / ask $5.50)",
            "$-2.10 per share | $-420 total (unrealized)"
        )
        
        with patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.EXPIRATION_DATE', date(2026, 1, 30)):
            data = get_monitor_data()
        
        assert data['current_price'] == 450.0
        assert data['dte'] == 10
        assert data['strike'] == 475.0
        assert data['volume'] == 1000
        assert data['open_interest'] == 5000
        assert 'status' in data
        assert 'premium_str' in data
        assert 'pnl_str' in data
        assert 'should_alert' in data
        assert 'alert_reasons' in data
    
    @patch('fintech_app.covered_call_monitor.get_tsla_data')
    @patch('fintech_app.covered_call_monitor.days_to_expiration')
    @patch('fintech_app.covered_call_monitor.calculate_status')
    @patch('fintech_app.covered_call_monitor.check_alert_conditions')
    def test_get_monitor_data_with_alert(self, mock_check_alert, mock_calc_status, mock_dte, mock_get_data):
        """Test monitor data with alert conditions."""
        mock_get_data.return_value = (
            465.0,
            {'bid': 5.0, 'ask': 5.5, 'last': 5.25, 'mid': 5.25},
            1000,
            5000
        )
        mock_dte.return_value = 5
        mock_calc_status.return_value = (
            "2.15% OTM",
            "$5.25 (bid $5.00 / ask $5.50)",
            "$-2.10 per share | $-420 total (unrealized)"
        )
        mock_check_alert.return_value = (True, ["Stock price $465.00 > $460.00", "Days to expiration (5) < 7"])
        
        with patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.EXPIRATION_DATE', date(2026, 1, 30)):
            data = get_monitor_data()
        
        assert data['should_alert'] is True
        assert len(data['alert_reasons']) == 2


class TestSendMonitorAlert:
    """Tests for send_monitor_alert function."""
    
    @patch('fintech_app.covered_call_monitor.get_monitor_data')
    @patch('fintech_app.covered_call_monitor.send_email_alert')
    def test_send_monitor_alert_conditions_met(self, mock_send_email, mock_get_data):
        """Test sending alert when conditions are met."""
        mock_get_data.return_value = {
            'should_alert': True,
            'alert_reasons': ["Stock price $465.00 > $460.00"],
            'current_price': 465.0,
            'dte': 5,
            'strike': 475.0,
            'status': "2.15% OTM",
            'premium_str': "$5.25 (bid $5.00 / ask $5.50)",
            'pnl_str': "$-2.10 per share | $-420 total (unrealized)",
            'roll_alert': "Monitor"
        }
        mock_send_email.return_value = True
        
        result = send_monitor_alert(
            "smtp.gmail.com", 587, "sender@example.com", "password", "recipient@example.com"
        )
        
        assert result is True
        mock_send_email.assert_called_once()
        call_args = mock_send_email.call_args
        # send_email_alert is called with positional args: smtp_server, smtp_port, sender_email, 
        # sender_password, recipient_email, subject, body
        args = call_args[0]
        assert len(args) >= 7
        subject = args[5]  # 6th positional arg (0-indexed)
        body = args[6]     # 7th positional arg
        assert "TSLA Covered Call Alert" in subject
        assert "Stock price $465.00" in body
    
    @patch('fintech_app.covered_call_monitor.get_monitor_data')
    @patch('fintech_app.covered_call_monitor.send_email_alert')
    def test_send_monitor_alert_conditions_not_met(self, mock_send_email, mock_get_data):
        """Test no alert sent when conditions are not met."""
        mock_get_data.return_value = {
            'should_alert': False,
            'alert_reasons': [],
            'current_price': 450.0,
            'dte': 10,
            'strike': 475.0,
            'status': "5.56% OTM",
            'premium_str': "$5.25 (bid $5.00 / ask $5.50)",
            'pnl_str': "$-2.10 per share | $-420 total (unrealized)",
            'roll_alert': "No action needed"
        }
        
        result = send_monitor_alert(
            "smtp.gmail.com", 587, "sender@example.com", "password", "recipient@example.com"
        )
        
        assert result is False
        mock_send_email.assert_not_called()


class TestGetTSLAData:
    """Tests for get_tsla_data function."""
    
    @patch('fintech_app.covered_call_monitor.yf.Ticker')
    def test_get_tsla_data_success(self, mock_ticker_class):
        """Test successful data retrieval."""
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker
        
        # Mock stock info
        mock_ticker.info = {'regularMarketPrice': 450.0}
        
        # Mock option chain
        mock_chain = MagicMock()
        mock_calls = pd.DataFrame({
            'strike': [470.0, 475.0, 480.0],
            'bid': [4.0, 5.0, 6.0],
            'ask': [4.5, 5.5, 6.5],
            'lastPrice': [4.25, 5.25, 6.25],
            'volume': [1000, 2000, 3000],
            'openInterest': [5000, 6000, 7000]
        })
        mock_chain.calls = mock_calls
        mock_ticker.option_chain.return_value = mock_chain
        
        with patch('fintech_app.covered_call_monitor.SYMBOL', 'TSLA'), \
             patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.EXPIRATION_DATE', date(2026, 1, 30)):
            current_price, opt_data, vol, oi = get_tsla_data()
        
        assert current_price == 450.0
        assert opt_data is not None
        assert opt_data['bid'] == 5.0
        assert opt_data['ask'] == 5.5
        assert opt_data['mid'] == 5.25
        assert vol == 2000
        assert oi == 6000
    
    @patch('fintech_app.covered_call_monitor.yf.Ticker')
    def test_get_tsla_data_no_strike_match(self, mock_ticker_class):
        """Test when strike is not found in options chain."""
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker
        
        mock_ticker.info = {'regularMarketPrice': 450.0}
        
        # Mock option chain with different strikes
        mock_chain = MagicMock()
        mock_calls = pd.DataFrame({
            'strike': [470.0, 480.0],
            'bid': [4.0, 6.0],
            'ask': [4.5, 6.5],
            'lastPrice': [4.25, 6.25],
            'volume': [1000, 3000],
            'openInterest': [5000, 7000]
        })
        mock_chain.calls = mock_calls
        mock_ticker.option_chain.return_value = mock_chain
        
        with patch('fintech_app.covered_call_monitor.SYMBOL', 'TSLA'), \
             patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.EXPIRATION_DATE', date(2026, 1, 30)):
            current_price, opt_data, vol, oi = get_tsla_data()
        
        assert current_price == 450.0
        assert opt_data is None
        assert vol is None
        assert oi is None
    
    @patch('fintech_app.covered_call_monitor.yf.Ticker')
    def test_get_tsla_data_fallback_to_history(self, mock_ticker_class):
        """Test fallback to history when price not in info."""
        mock_ticker = MagicMock()
        mock_ticker_class.return_value = mock_ticker
        
        # No price in info
        mock_ticker.info = {}
        
        # Mock history
        dates = pd.date_range('2024-01-01', periods=1, freq='D')
        mock_history = pd.DataFrame({'Close': [450.0]}, index=dates)
        mock_ticker.history.return_value = mock_history
        
        # Mock option chain
        mock_chain = MagicMock()
        mock_calls = pd.DataFrame({
            'strike': [475.0],
            'bid': [5.0],
            'ask': [5.5],
            'lastPrice': [5.25],
            'volume': [2000],
            'openInterest': [6000]
        })
        mock_chain.calls = mock_calls
        mock_ticker.option_chain.return_value = mock_chain
        
        with patch('fintech_app.covered_call_monitor.SYMBOL', 'TSLA'), \
             patch('fintech_app.covered_call_monitor.STRIKE', 475.0), \
             patch('fintech_app.covered_call_monitor.EXPIRATION_DATE', date(2026, 1, 30)):
            current_price, opt_data, vol, oi = get_tsla_data()
        
        assert current_price == 450.0
        assert opt_data is not None
