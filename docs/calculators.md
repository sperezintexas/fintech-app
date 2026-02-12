# Setup → Calculators

Mortgage and affordability calculators live under **Setup → Calculators** (`/automation/calculators`).

## Mortgage Calculator

Estimates **total monthly payment** from home price and terms.

- **Inputs:** Mortgage type (30/15/20/10 year fixed), interest rate %, price of home, down payment $, property taxes/year, insurance/year, PMI/year.
- **Output:** Total monthly payment and breakdown: Principal and interest, Taxes, Insurance, PMI.
- **Logic:** Standard amortization (P&I) plus monthly prorated taxes, insurance, and PMI.

## Mortgage Affordability Calculator

Estimates **maximum purchase price** from income and expenses.

- **Inputs:** Monthly income, monthly home expenses, other monthly expenses, down payment %, interest rate %, amortization (years).
- **Logic:** Amount available for mortgage P&I = Income − Home expenses − Other expenses. From that monthly payment we solve for max principal, then max purchase price = principal / (1 − down %) and down payment = price × down %.
- **Output:** Maximum purchase price, down payment amount, mortgage principal, mortgage monthly payment.
- **Clear** resets inputs and results to defaults.

## Navigation

- **Setup** header and nav: same layout as other Setup sections (Auth Users, Alert Settings, Strategy, Scheduled Jobs, Job run history, Job types, Login history, xTools Console).
- Link: [Setup → Calculators](/automation/calculators).
