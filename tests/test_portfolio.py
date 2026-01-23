import pytest
from fintech_app.portfolio import Portfolio


class TestPortfolio:
    """Unit tests for Portfolio class."""

    def test_init_default_values(self):
        """Test Portfolio initialization with default values."""
        portfolio = Portfolio(use_db=False)
        assert portfolio.shares == 525  # From config
        assert portfolio.cash == 0  # From config
        assert portfolio.positions == []

    def test_init_custom_values(self):
        """Test Portfolio initialization with custom values."""
        portfolio = Portfolio(shares=100, cash=5000, use_db=False)
        assert portfolio.shares == 100
        assert portfolio.cash == 5000
        assert portfolio.positions == []

    def test_add_position_call(self):
        """Test adding a call option position."""
        portfolio = Portfolio(cash=10000, use_db=False)
        portfolio.add_position('call', strike=250.0, premium=5.0, qty=2)
        
        assert len(portfolio.positions) == 1
        assert portfolio.positions[0]['type'] == 'call'
        assert portfolio.positions[0]['strike'] == 250.0
        assert portfolio.positions[0]['premium'] == 5.0
        assert portfolio.positions[0]['qty'] == 2
        assert portfolio.cash == 10000 - (5.0 * 2 * 100)  # Cost deducted

    def test_add_position_put(self):
        """Test adding a put option position."""
        portfolio = Portfolio(cash=10000, use_db=False)
        portfolio.add_position('put', strike=200.0, premium=3.0, qty=1)
        
        assert len(portfolio.positions) == 1
        assert portfolio.positions[0]['type'] == 'put'
        assert portfolio.cash == 10000 - (3.0 * 1 * 100)

    def test_add_position_insufficient_cash(self):
        """Test that adding a position with insufficient cash raises ValueError."""
        portfolio = Portfolio(cash=100, use_db=False)
        with pytest.raises(ValueError, match="Insufficient cash"):
            portfolio.add_position('call', strike=250.0, premium=5.0, qty=1)

    def test_get_value_no_positions(self):
        """Test portfolio value calculation with no options positions."""
        portfolio = Portfolio(shares=100, cash=5000, use_db=False)
        current_price = 200.0
        value = portfolio.get_value(current_price)
        
        assert value == (100 * 200.0) + 5000  # Stock value + cash

    def test_get_value_with_call_in_the_money(self):
        """Test portfolio value with ITM call option."""
        portfolio = Portfolio(shares=100, cash=5000, use_db=False)
        portfolio.add_position('call', strike=180.0, premium=5.0, qty=1)
        current_price = 200.0
        
        value = portfolio.get_value(current_price)
        # Stock: 100 * 200 = 20000
        # Cash: 5000 - (5 * 100) = 4500
        # Call intrinsic: (200 - 180) * 1 * 100 = 2000
        # Call time value: 5 * 1 * 100 * 0.5 = 250
        expected = 20000 + 4500 + 2000 + 250
        assert value == pytest.approx(expected)

    def test_get_value_with_call_out_of_the_money(self):
        """Test portfolio value with OTM call option."""
        portfolio = Portfolio(shares=100, cash=5000, use_db=False)
        portfolio.add_position('call', strike=250.0, premium=5.0, qty=1)
        current_price = 200.0
        
        value = portfolio.get_value(current_price)
        # Stock: 100 * 200 = 20000
        # Cash: 5000 - (5 * 100) = 4500
        # Call intrinsic: max(200 - 250, 0) = 0
        # Call time value: 5 * 1 * 100 * 0.5 = 250
        expected = 20000 + 4500 + 0 + 250
        assert value == pytest.approx(expected)

    def test_get_value_with_put_in_the_money(self):
        """Test portfolio value with ITM put option."""
        portfolio = Portfolio(shares=100, cash=5000, use_db=False)
        portfolio.add_position('put', strike=220.0, premium=3.0, qty=1)
        current_price = 200.0
        
        value = portfolio.get_value(current_price)
        # Stock: 100 * 200 = 20000
        # Cash: 5000 - (3 * 100) = 4700
        # Put intrinsic: (220 - 200) * 1 * 100 = 2000
        # Put time value: 3 * 1 * 100 * 0.5 = 150
        expected = 20000 + 4700 + 2000 + 150
        assert value == pytest.approx(expected)

    def test_update_shares(self):
        """Test updating share count."""
        portfolio = Portfolio(shares=100, use_db=False)
        portfolio.update_shares(200)
        assert portfolio.shares == 200

    def test_multiple_positions(self):
        """Test portfolio with multiple option positions."""
        portfolio = Portfolio(shares=100, cash=20000, use_db=False)
        portfolio.add_position('call', strike=250.0, premium=5.0, qty=1)
        portfolio.add_position('put', strike=200.0, premium=3.0, qty=1)
        
        assert len(portfolio.positions) == 2
        assert portfolio.cash == 20000 - (5.0 * 100) - (3.0 * 100)
