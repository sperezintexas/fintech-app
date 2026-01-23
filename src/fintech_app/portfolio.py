from .config import TSLA_SHARES, CASH_AVAILABLE
from .database import PortfolioDB
from typing import Optional

class Portfolio:
    def __init__(self, shares=TSLA_SHARES, cash=CASH_AVAILABLE, use_db: bool = True):
        self.shares = shares
        self.cash = cash
        self.positions = []  # List of dicts: {'type': 'call/put', 'strike': float, 'premium': float, 'qty': int}
        self.use_db = use_db
        self.db = PortfolioDB() if use_db else None
        
        # Load from database if available
        if use_db and self.db:
            latest = self.db.get_latest_portfolio_snapshot()
            if latest:
                self.shares = latest.get('shares', shares)
                self.cash = latest.get('cash', cash)
            
            # Load stock position
            stock_pos = self.db.get_stock_position('TSLA')
            if stock_pos:
                self.shares = stock_pos.get('quantity', self.shares)

    def add_position(self, pos_type, strike, premium, qty, expiration: Optional[str] = None, 
                    action: str = 'buy', save_to_db: bool = True):
        """Add an options position."""
        cost = premium * qty * 100  # Per contract
        if action == 'buy' and cost > self.cash:
            raise ValueError("Insufficient cash for position")
        
        if action == 'buy':
            self.cash -= cost
        else:  # sell
            self.cash += cost
        
        position_data = {'type': pos_type, 'strike': strike, 'premium': premium, 'qty': qty}
        self.positions.append(position_data)
        
        # Save to database
        if save_to_db and self.db and expiration:
            position_id = self.db.add_options_position(
                pos_type=pos_type,
                action=action,
                strike=strike,
                expiration=expiration,
                quantity=qty,
                premium=premium
            )
            # Record transaction
            self.db.add_transaction(
                trans_type=f"{action}_{pos_type}",
                symbol='TSLA',
                quantity=qty,
                price=premium,
                strike=strike,
                expiration=expiration,
                premium=premium,
                total_cost=cost if action == 'buy' else -cost
            )
            position_data['db_id'] = position_id
        
        return position_data

    def get_value(self, current_price):
        """Estimate total portfolio value including options."""
        stock_value = self.shares * current_price
        options_value = 0
        for pos in self.positions:
            if pos['type'] == 'call':
                intrinsic = max(current_price - pos['strike'], 0) * pos['qty'] * 100
            else:  # put
                intrinsic = max(pos['strike'] - current_price, 0) * pos['qty'] * 100
            options_value += intrinsic + (pos['premium'] * pos['qty'] * 100 * 0.5)  # Rough time value decay
        return stock_value + self.cash + options_value

    def update_shares(self, new_shares, current_price: Optional[float] = None, save_to_db: bool = True):
        """Update share count and save to database."""
        old_shares = self.shares
        self.shares = new_shares
        
        if save_to_db and self.db:
            # Update stock position
            self.db.update_stock_position(
                symbol='TSLA',
                quantity=new_shares,
                avg_cost=current_price or 0,  # Would need to track avg cost properly
                current_price=current_price
            )
            
            # Record transaction if shares changed
            if new_shares != old_shares:
                diff = new_shares - old_shares
                trans_type = 'buy_stock' if diff > 0 else 'sell_stock'
                cost = abs(diff) * (current_price or 0)
                
                self.db.add_transaction(
                    trans_type=trans_type,
                    symbol='TSLA',
                    quantity=abs(diff),
                    price=current_price or 0,
                    total_cost=cost
                )
            
            # Save portfolio snapshot
            total_value = self.get_value(current_price) if current_price else 0
            self.db.save_portfolio_snapshot(
                shares=new_shares,
                cash=self.cash,
                total_value=total_value
            )
    
    def save_snapshot(self, current_price: float):
        """Save current portfolio state to database."""
        if self.db:
            total_value = self.get_value(current_price)
            self.db.save_portfolio_snapshot(
                shares=self.shares,
                cash=self.cash,
                total_value=total_value
            )