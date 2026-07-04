# Roadmap

Build one phase at a time. Do NOT build a later phase unless explicitly asked.

## Phase 1 — core (done)
Multiple portfolios, add assets, record transactions, enter prices manually,
display holdings with P&L.
_(covers original requirements: multiple portfolios + price tracking)_

## Phase 2 — rebalancing (in progress)
`targets` table (desired % per asset or per group). Compute drift and how much
to buy/sell — in % AND in baht/units. Allocation pie: current vs target.
_(original requirement #3)_

## Phase 3 — accurate returns
Dividends / total return, multi-currency + FX, CSV/paste price import,
multi-dimension allocation (sector / country / currency).

## Phase 4 — history & benchmark
`portfolio_snapshots`, growth chart, benchmark comparison (SET, S&P 500), XIRR,
drift-threshold alerts.

## Phase 5 — Thai tax & live prices
RMF/SSF/ThaiESG holding-period tracking, dividend tax, price APIs.

## Phase 6 — LLM / wiki
LLM-assisted analysis over the structured data.
_(original requirement #4)_
