"use client";

import { useState, useCallback } from "react";

// --- Mortgage Calculator (payment from price) ---
function monthlyPAndI(principal: number, annualRatePercent: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

type MortgageCalcState = {
  mortgageType: string;
  interestRate: string;
  priceOfHome: string;
  downPayment: string;
  propertyTaxes: string;
  insurance: string;
  pmi: string;
};

const MORTGAGE_YEARS: Record<string, number> = {
  "30 year fixed": 30,
  "15 year fixed": 15,
  "20 year fixed": 20,
  "10 year fixed": 10,
};

function MortgageCalculator() {
  const [state, setState] = useState<MortgageCalcState>({
    mortgageType: "30 year fixed",
    interestRate: "3.890",
    priceOfHome: "250000",
    downPayment: "35000",
    propertyTaxes: "1900",
    insurance: "900",
    pmi: "1080",
  });
  const [result, setResult] = useState<{
    principalAndInterest: number;
    taxes: number;
    insurance: number;
    pmi: number;
    total: number;
    downPaymentPct: number;
  } | null>(null);

  const price = parseFloat(state.priceOfHome) || 0;
  const down = parseFloat(state.downPayment) || 0;
  const downPct = price > 0 ? (down / price) * 100 : 0;

  const calculate = useCallback(() => {
    const principal = Math.max(0, price - down);
    const years = MORTGAGE_YEARS[state.mortgageType] ?? 30;
    const rate = parseFloat(state.interestRate) || 0;
    const taxesYear = parseFloat(state.propertyTaxes) || 0;
    const insuranceYear = parseFloat(state.insurance) || 0;
    const pmiYear = parseFloat(state.pmi) || 0;

    const pAndI = monthlyPAndI(principal, rate, years);
    const taxes = taxesYear / 12;
    const ins = insuranceYear / 12;
    const pmiMonthly = pmiYear / 12;
    setResult({
      principalAndInterest: pAndI,
      taxes,
      insurance: ins,
      pmi: pmiMonthly,
      total: pAndI + taxes + ins + pmiMonthly,
      downPaymentPct: price > 0 ? (down / price) * 100 : 0,
    });
  }, [state, price, down]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900">Mortgage Calculator</h3>
        <p className="text-sm text-gray-500 mt-1">Estimate total monthly payment from home price and terms.</p>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mortgage</label>
            <select
              value={state.mortgageType}
              onChange={(e) => setState((s) => ({ ...s, mortgageType: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900"
            >
              {Object.keys(MORTGAGE_YEARS).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interest rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.001"
                min="0"
                value={state.interestRate}
                onChange={(e) => setState((s) => ({ ...s, interestRate: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
              <span className="text-gray-500">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price of home</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={state.priceOfHome}
                onChange={(e) => setState((s) => ({ ...s, priceOfHome: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Down payment</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={state.downPayment}
                onChange={(e) => setState((s) => ({ ...s, downPayment: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
              {price > 0 && <span className="text-gray-500">({downPct.toFixed(0)}%)</span>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Property taxes</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={state.propertyTaxes}
                onChange={(e) => setState((s) => ({ ...s, propertyTaxes: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
              <span className="text-gray-500">/year</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Insurance</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={state.insurance}
                onChange={(e) => setState((s) => ({ ...s, insurance: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
              <span className="text-gray-500">/year</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">PMI</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                min="0"
                value={state.pmi}
                onChange={(e) => setState((s) => ({ ...s, pmi: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg"
              />
              <span className="text-gray-500">/year</span>
            </div>
          </div>
          <button
            type="button"
            onClick={calculate}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
          >
            Calculate
          </button>
        </div>
        <div className="flex flex-col justify-center">
          {result ? (
            <>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">Total monthly payment</p>
              <p className="text-4xl font-bold text-blue-600 mb-6">
                ${Math.round(result.total).toLocaleString()}
              </p>
              <ul className="space-y-2 text-gray-700">
                <li className="flex justify-between">
                  <span>Principal and interest</span>
                  <span className="font-medium">${result.principalAndInterest.toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Taxes</span>
                  <span className="font-medium">${result.taxes.toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span>Insurance</span>
                  <span className="font-medium">${result.insurance.toFixed(2)}</span>
                </li>
                <li className="flex justify-between">
                  <span>PMI</span>
                  <span className="font-medium">${result.pmi.toFixed(2)}</span>
                </li>
              </ul>
            </>
          ) : (
            <p className="text-gray-500 text-sm">Enter values and click Calculate.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Mortgage Affordability (max price from income/expenses) ---
function principalFromPayment(monthlyPayment: number, annualRatePercent: number, years: number): number {
  if (monthlyPayment <= 0 || years <= 0) return 0;
  const r = annualRatePercent / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthlyPayment * n;
  return (monthlyPayment * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n));
}

type AffordabilityState = {
  monthlyIncome: string;
  monthlyHomeExpenses: string;
  otherMonthlyExpenses: string;
  downPaymentPct: string;
  interestRatePct: string;
  amortizationYears: string;
};

const DEFAULT_AFFORD: AffordabilityState = {
  monthlyIncome: "4000",
  monthlyHomeExpenses: "250",
  otherMonthlyExpenses: "150",
  downPaymentPct: "15",
  interestRatePct: "3",
  amortizationYears: "30",
};

function MortgageAffordabilityCalculator() {
  const [state, setState] = useState<AffordabilityState>(DEFAULT_AFFORD);
  const [result, setResult] = useState<{
    maxPurchasePrice: number;
    downPaymentAmount: number;
    mortgagePrincipal: number;
    mortgageMonthlyPayment: number;
  } | null>(null);

  const calculate = useCallback(() => {
    const income = parseFloat(state.monthlyIncome) || 0;
    const homeExp = parseFloat(state.monthlyHomeExpenses) || 0;
    const otherExp = parseFloat(state.otherMonthlyExpenses) || 0;
    const downPct = Math.min(99, Math.max(0, parseFloat(state.downPaymentPct) || 0)) / 100;
    const rate = parseFloat(state.interestRatePct) || 0;
    const years = Math.max(1, Math.min(50, parseFloat(state.amortizationYears) || 30));

    const maxPayment = Math.max(0, income - homeExp - otherExp);
    const principal = principalFromPayment(maxPayment, rate, years);
    const maxPrice = principal / (1 - downPct);
    const downAmount = maxPrice * downPct;

    setResult({
      maxPurchasePrice: maxPrice,
      downPaymentAmount: downAmount,
      mortgagePrincipal: principal,
      mortgageMonthlyPayment: maxPayment,
    });
  }, [state]);

  const clear = useCallback(() => {
    setState(DEFAULT_AFFORD);
    setResult(null);
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="bg-emerald-700 px-6 py-3">
        <h3 className="text-lg font-semibold text-white">Mortgage Affordability Calculator</h3>
        <p className="text-sm text-emerald-100 mt-0.5">
          Max purchase price from income and expenses. Amount for mortgage = Income − Home expenses − Other expenses.
        </p>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly income</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium">$</span>
              <input
                type="number"
                min="0"
                value={state.monthlyIncome}
                onChange={(e) => setState((s) => ({ ...s, monthlyIncome: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monthly home expenses</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium">$</span>
              <input
                type="number"
                min="0"
                value={state.monthlyHomeExpenses}
                onChange={(e) => setState((s) => ({ ...s, monthlyHomeExpenses: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Other monthly expenses</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium">$</span>
              <input
                type="number"
                min="0"
                value={state.otherMonthlyExpenses}
                onChange={(e) => setState((s) => ({ ...s, otherMonthlyExpenses: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Down payment %</label>
            <div className="flex">
              <input
                type="number"
                min="0"
                max="99"
                value={state.downPaymentPct}
                onChange={(e) => setState((s) => ({ ...s, downPaymentPct: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-l-lg"
              />
              <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interest rate %</label>
            <div className="flex">
              <input
                type="number"
                step="0.1"
                min="0"
                value={state.interestRatePct}
                onChange={(e) => setState((s) => ({ ...s, interestRatePct: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-l-lg"
              />
              <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amortization</label>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-200 bg-emerald-50 text-emerald-700 font-medium text-sm">Years</span>
              <input
                type="number"
                min="1"
                max="50"
                value={state.amortizationYears}
                onChange={(e) => setState((s) => ({ ...s, amortizationYears: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-r-lg"
              />
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={calculate}
          className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
        >
          Calculate
        </button>

        {result && (
          <>
            <hr className="border-gray-200" />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-gray-800">
              <div>
                <dt className="text-sm text-gray-500">Maximum purchase price</dt>
                <dd className="text-xl font-semibold">${result.maxPurchasePrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Down payment amount</dt>
                <dd className="text-xl font-semibold">${result.downPaymentAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Mortgage principal</dt>
                <dd className="text-xl font-semibold">${result.mortgagePrincipal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Mortgage monthly payment</dt>
                <dd className="text-xl font-semibold">${result.mortgageMonthlyPayment.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
              </div>
            </dl>
          </>
        )}

        <button
          type="button"
          onClick={clear}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export default function CalculatorsPage() {
  return (
    <div className="space-y-8">
      <MortgageCalculator />
      <MortgageAffordabilityCalculator />
    </div>
  );
}
