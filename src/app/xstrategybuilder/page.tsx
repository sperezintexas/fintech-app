'use client';

import { useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { StrategyWizard } from '@/components/strategy-builder/StrategyWizard';

export default function XStrategyBuilderPage() {
  const [activeTab, setActiveTab] = useState('wizard');

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900">xStrategyBuilder</h2>
          <p className="text-gray-600 mt-1">
            Build sophisticated option strategies with real-time data and P/L analysis.
          </p>
        </div>

        <div className="flex gap-1 mb-8">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`px-6 py-2 rounded-t-lg font-medium transition-all ${
              activeTab === 'wizard'
                ? 'bg-white shadow-sm border border-b-0 border-gray-200 text-blue-600'
                : 'bg-white/60 hover:bg-white text-gray-600 border border-transparent'
            }`}
          >
            Strategy Wizard
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-2 rounded-t-lg font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-white shadow-sm border border-b-0 border-gray-200 text-blue-600'
                : 'bg-white/60 hover:bg-white text-gray-600 border border-transparent'
            }`}
          >
            Strategy Preview
          </button>
        </div>

        {activeTab === 'wizard' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8">
            <StrategyWizard />
          </div>
        )}
        {activeTab === 'preview' && (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Preview Your Strategy</h3>
            <p className="text-gray-500">Select a strategy in the wizard to preview here.</p>
          </div>
        )}
      </main>
    </div>
  );
}
