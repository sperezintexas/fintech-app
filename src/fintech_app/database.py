"""
Database module for portfolio tracking using JSON.
Tracks portfolio positions, transactions, and options trades.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
import json

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "portfolio.json"


class PortfolioDB:
    """JSON file-based storage for portfolio tracking."""
    
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self._init_store()
    
    def _init_store(self) -> None:
        """Initialize JSON store if missing."""
        if not self.db_path.parent.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.db_path.exists():
            self._write_store({
                "portfolio_snapshots": [],
                "transactions": [],
                "options_positions": [],
                "stock_positions": []
            })

    def _read_store(self) -> Dict[str, Any]:
        try:
            data = json.loads(self.db_path.read_text())
            if not isinstance(data, dict):
                raise ValueError("Invalid store format")
        except Exception:
            data = {
                "portfolio_snapshots": [],
                "transactions": [],
                "options_positions": [],
                "stock_positions": []
            }
        for key in ["portfolio_snapshots", "transactions", "options_positions", "stock_positions"]:
            if key not in data or not isinstance(data[key], list):
                data[key] = []
        return data

    def _write_store(self, data: Dict[str, Any]) -> None:
        self.db_path.write_text(json.dumps(data, indent=2))

    def _next_id(self, records: List[Dict[str, Any]]) -> int:
        return (max((r.get("id", 0) for r in records), default=0) + 1)

    def _now(self) -> str:
        return datetime.now().isoformat(timespec="seconds")
    
    def save_portfolio_snapshot(self, shares: int, cash: float, total_value: float, notes: Optional[str] = None):
        """Save a portfolio snapshot."""
        data = self._read_store()
        snapshot = {
            "id": self._next_id(data["portfolio_snapshots"]),
            "timestamp": self._now(),
            "shares": shares,
            "cash": cash,
            "total_value": total_value,
            "notes": notes
        }
        data["portfolio_snapshots"].append(snapshot)
        self._write_store(data)
    
    def add_transaction(self, trans_type: str, symbol: str, quantity: int, price: float,
                       total_cost: float, strike: Optional[float] = None, expiration: Optional[str] = None,
                       premium: Optional[float] = None, notes: Optional[str] = None):
        """Add a transaction record."""
        data = self._read_store()
        transaction = {
            "id": self._next_id(data["transactions"]),
            "timestamp": self._now(),
            "type": trans_type,
            "symbol": symbol,
            "quantity": quantity,
            "price": price,
            "strike": strike,
            "expiration": expiration,
            "premium": premium,
            "total_cost": total_cost,
            "notes": notes
        }
        data["transactions"].append(transaction)
        self._write_store(data)
    
    def add_options_position(self, pos_type: str, action: str, strike: float, expiration: str,
                           quantity: int, premium: float, symbol: str = 'TSLA', notes: Optional[str] = None):
        """Add an options position."""
        data = self._read_store()
        position_id = self._next_id(data["options_positions"])
        position = {
            "id": position_id,
            "created_at": self._now(),
            "updated_at": self._now(),
            "type": pos_type,
            "action": action,
            "symbol": symbol,
            "strike": strike,
            "expiration": expiration,
            "quantity": quantity,
            "premium": premium,
            "status": "open",
            "closed_at": None,
            "profit_loss": None,
            "notes": notes
        }
        data["options_positions"].append(position)
        self._write_store(data)
        return position_id
    
    def update_options_position(self, position_id: int, status: str, profit_loss: Optional[float] = None,
                                notes: Optional[str] = None):
        """Update an options position (close, assign, etc.)."""
        data = self._read_store()
        for pos in data["options_positions"]:
            if pos.get("id") == position_id:
                pos["status"] = status
                pos["updated_at"] = self._now()
                if profit_loss is not None:
                    pos["profit_loss"] = profit_loss
                if status in ["closed", "assigned", "expired"]:
                    pos["closed_at"] = self._now()
                if notes:
                    pos["notes"] = notes
                break
        self._write_store(data)
    
    def delete_options_position(self, position_id: int) -> bool:
        """Delete an options position by ID."""
        data = self._read_store()
        positions = data["options_positions"]
        original_count = len(positions)
        data["options_positions"] = [p for p in positions if p.get("id") != position_id]
        if len(data["options_positions"]) < original_count:
            self._write_store(data)
            return True
        return False
    
    def get_open_options_positions(self, symbol: str = 'TSLA') -> List[Dict]:
        """Get all open options positions."""
        data = self._read_store()
        positions = [
            p for p in data["options_positions"]
            if p.get("symbol") == symbol and p.get("status") == "open"
        ]
        positions.sort(key=lambda p: (p.get("expiration", ""), p.get("strike", 0)))
        return positions
    
    def get_all_options_positions(self, symbol: str = 'TSLA', limit: int = 100) -> List[Dict]:
        """Get all options positions (including closed)."""
        data = self._read_store()
        positions = [p for p in data["options_positions"] if p.get("symbol") == symbol]
        positions.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return positions[:limit]
    
    def get_recent_transactions(self, limit: int = 50) -> List[Dict]:
        """Get recent transactions."""
        data = self._read_store()
        transactions = list(data["transactions"])
        transactions.sort(key=lambda t: t.get("timestamp", ""), reverse=True)
        return transactions[:limit]
    
    def get_portfolio_history(self, limit: int = 100) -> List[Dict]:
        """Get portfolio snapshot history."""
        data = self._read_store()
        snapshots = list(data["portfolio_snapshots"])
        snapshots.sort(key=lambda s: s.get("timestamp", ""), reverse=True)
        return snapshots[:limit]
    
    def get_latest_portfolio_snapshot(self) -> Optional[Dict]:
        """Get the latest portfolio snapshot."""
        data = self._read_store()
        snapshots = list(data["portfolio_snapshots"])
        if not snapshots:
            return None
        snapshots.sort(key=lambda s: s.get("timestamp", ""), reverse=True)
        return snapshots[0]
    
    def update_stock_position(self, symbol: str, quantity: int, avg_cost: float, 
                            current_price: Optional[float] = None, notes: Optional[str] = None):
        """Update or create stock position."""
        data = self._read_store()
        positions = data["stock_positions"]
        existing = next((p for p in positions if p.get("symbol") == symbol), None)
        total_value = quantity * current_price if current_price is not None else quantity * avg_cost
        if existing:
            existing["updated_at"] = self._now()
            existing["quantity"] = quantity
            existing["avg_cost"] = avg_cost
            existing["current_price"] = current_price
            existing["total_value"] = total_value
            if notes:
                existing["notes"] = notes
        else:
            positions.append({
                "id": self._next_id(positions),
                "created_at": self._now(),
                "updated_at": self._now(),
                "symbol": symbol,
                "quantity": quantity,
                "avg_cost": avg_cost,
                "current_price": current_price,
                "total_value": total_value,
                "notes": notes
            })
        self._write_store(data)
    
    def get_stock_position(self, symbol: str = 'TSLA') -> Optional[Dict]:
        """Get current stock position."""
        data = self._read_store()
        return next((p for p in data["stock_positions"] if p.get("symbol") == symbol), None)
