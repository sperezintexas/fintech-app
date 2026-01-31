'use client';

import { useState } from 'react';
import { StrategyWizard } from '@/components/strategy-builder/StrategyWizard';

export default function XStrategyBuilderPage() {
  const [activeTab, setActiveTab] = useState('wizard');

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
            xStrategyBuilder
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Build sophisticated option strategies with real-time data and P/L analysis.
          </p>
        </div>

        <div className="flex gap-1 mb-8 justify-center">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`px-6 py-2 rounded-t-lg font-medium transition-all ${
              activeTab === 'wizard'
                ? 'bg-white shadow-sm border-b-2 border-indigo-600 text-indigo-600'
                : 'bg-white/50 hover:bg-white text-gray-600'
            }`}
          >
            Strategy Wizard
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-2 rounded-t-lg font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-white shadow-sm border-b-2 border-indigo-600 text-indigo-600'
                : 'bg-white/50 hover:bg-white text-gray-600'
            }`}
          >
            Strategy Preview
          </button>
        </div>

        {activeTab === 'wizard' && (
          <div className="bg-white rounded-xl shadow-lg border p-8">
            <StrategyWizard />
          </div>
        )}
        {activeTab === 'preview' && (
          <div className="bg-white rounded-xl shadow-lg border p-8">
            <h2 className="text-2xl font-bold mb-4">Preview Your Strategy</h2>
            <p className="text-gray-500">Select a strategy in the wizard to preview here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
