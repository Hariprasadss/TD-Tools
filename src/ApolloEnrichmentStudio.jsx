import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Play, Pause, Download, Settings, Users, Zap, BarChart3, CheckCircle, XCircle, Clock, Filter, RefreshCw, AlertCircle, TrendingUp, Database, Globe } from 'lucide-react';

// CSV Parser utility
const parseCSV = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
  const data = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  }).filter(row => (row.firstName || row.first_name) && (row.lastName || row.last_name));
  
  return data.map(row => ({
    firstName: row.firstName || row.first_name || '',
    lastName: row.lastName || row.last_name || '',
    domain: row.domain || row.company_domain || '',
    email: row.email || ''
  }));
};

const ApolloEnrichmentStudio = () => {
  const [apiKey, setApiKey] = useState('');
  const [csvData, setCsvData] = useState([]);
  const [enrichedData, setEnrichedData] = useState([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ 
    processed: 0, 
    successful: 0, 
    failed: 0, 
    qualityScore: 0,
    duplicates: 0,
    apiCalls: 0,
    creditsUsed: 0
  });
  const [isDark, setIsDark] = useState(true);
  const [batchSize, setBatchSize] = useState(10);
  const [retryAttempts, setRetryAttempts] = useState(3);
  const [enrichmentSettings, setEnrichmentSettings] = useState({
    revealPersonalEmails: true,
    revealPhoneNumbers: false,
    includeSocialProfiles: true,
    includeEmploymentHistory: true
  });
  const [filters, setFilters] = useState({
    minQualityScore: 0,
    excludeDuplicates: true,
    requiredFields: []
  });
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const fileInputRef = useRef(null);
  const enrichmentController = useRef(null);

  // Sample data for testing
  const sampleData = [
    { firstName: 'Tim', lastName: 'Zheng', domain: 'apollo.io', email: 'tim@apollo.io' },
    { firstName: 'John', lastName: 'Doe', domain: 'salesforce.com', email: '' },
    { firstName: 'Jane', lastName: 'Smith', domain: 'hubspot.com', email: '' },
    { firstName: 'Mike', lastName: 'Johnson', domain: 'google.com', email: '' },
    { firstName: 'Sarah', lastName: 'Wilson', domain: 'microsoft.com', email: '' }
  ];

  const calculateQualityScore = (enrichedContacts) => {
    if (enrichedContacts.length === 0) return 0;
    
    const scores = enrichedContacts.map(contact => {
      let score = 0;
      if (contact.email) score += 30;
      if (contact.linkedinUrl) score += 25;
      if (contact.title) score += 20;
      if (contact.company) score += 15;
      if (contact.location) score += 10;
      return score;
    });
    
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  };

  const removeDuplicates = (data) => {
    const seen = new Set();
    const duplicates = [];
    const unique = data.filter(contact => {
      const key = `${contact.firstName?.toLowerCase()}-${contact.lastName?.toLowerCase()}-${contact.domain?.toLowerCase()}`;
      if (seen.has(key)) {
        duplicates.push(contact);
        return false;
      }
      seen.add(key);
      return true;
    });
    return { unique, duplicates };
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    addLog(`Uploading file: ${file.name}`, 'info');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = parseCSV(e.target.result);
        const { unique, duplicates } = filters.excludeDuplicates ? removeDuplicates(data) : { unique: data, duplicates: [] };
        
        setCsvData(unique);
        setStats(prev => ({ ...prev, duplicates: duplicates.length }));
        addLog(`✅ Uploaded ${unique.length} unique contacts (${duplicates.length} duplicates removed)`, 'success');
      } catch (error) {
        addLog(`❌ Error parsing CSV: ${error.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [{ timestamp, message, type, id: Date.now() }, ...prev.slice(0, 99)]);
  };

  const enrichContactsBatch = async (contacts) => {
    try {
      const response = await fetch('/api/apollo-enrichment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          contacts,
          settings: enrichmentSettings
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Enrichment error:', error);
      throw error;
    }
  };

  const startEnrichment = async () => {
    if (!apiKey.trim()) {
      addLog('❌ Please enter your Apollo API key', 'error');
      return;
    }
    
    if (csvData.length === 0) {
      addLog('❌ Please upload a CSV file first', 'error');
      return;
    }

    setIsEnriching(true);
    setIsPaused(false);
    setProgress(0);
    setCurrentBatch(0);
    setStats(prev => ({ ...prev, processed: 0, successful: 0, failed: 0, apiCalls: 0, creditsUsed: 0 }));
    addLog('🚀 Starting Apollo enrichment process...', 'info');

    const batches = [];
    for (let i = 0; i < csvData.length; i += batchSize) {
      batches.push(csvData.slice(i, i + batchSize));
    }
    setTotalBatches(batches.length);

    const results = [];
    let successCount = 0;
    let failCount = 0;
    let apiCallCount = 0;

    enrichmentController.current = new AbortController();

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (enrichmentController.current?.signal.aborted) {
          addLog('⏸️ Enrichment paused by user', 'info');
          break;
        }

        setCurrentBatch(batchIndex + 1);
        const batch = batches[batchIndex];
        
        addLog(`🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} contacts)`, 'info');

        try {
          const batchResult = await enrichContactsBatch(batch);
          apiCallCount += batchResult.apiCalls || 1;
          
          if (batchResult.success && batchResult.data) {
            for (const enriched of batchResult.data) {
              if (enriched.enrichmentStatus === 'success') {
                successCount++;
                addLog(`✅ Enriched ${enriched.firstName} ${enriched.lastName} - ${enriched.title || 'No title'} at ${enriched.company || 'Unknown company'}`, 'success');
              } else {
                failCount++;
                addLog(`❌ Failed to enrich ${enriched.firstName} ${enriched.lastName}`, 'error');
              }
              results.push(enriched);
            }
          } else {
            failCount += batch.length;
            batch.forEach(contact => {
              results.push({ ...contact, enrichmentStatus: 'failed', error: batchResult.error || 'Unknown error' });
              addLog(`❌ Failed to enrich ${contact.firstName} ${contact.lastName}`, 'error');
            });
          }
          
          setStats(prev => ({ 
            ...prev, 
            processed: results.length, 
            successful: successCount, 
            failed: failCount,
            apiCalls: apiCallCount,
            creditsUsed: apiCallCount
          }));
          
          setProgress((results.length / csvData.length) * 100);
          
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
        } catch (error) {
          addLog(`❌ Batch ${batchIndex + 1} failed: ${error.message}`, 'error');
          
          batch.forEach(contact => {
            results.push({ ...contact, enrichmentStatus: 'failed', error: error.message });
          });
          failCount += batch.length;
        }
      }
      
      setEnrichedData(results);
      const qualityScore = calculateQualityScore(results.filter(r => r.enrichmentStatus === 'success'));
      setStats(prev => ({ ...prev, qualityScore }));
      
      if (enrichmentController.current?.signal.aborted) {
        addLog(`⏸️ Enrichment paused - ${successCount} successful, ${failCount} failed`, 'info');
      } else {
        addLog(`🎉 Enrichment completed! ${successCount} successful, ${failCount} failed (Quality Score: ${qualityScore}%)`, 'success');
      }
      
    } catch (error) {
      addLog(`💥 Enrichment process failed: ${error.message}`, 'error');
    }
    
    setIsEnriching(false);
  };

  const pauseEnrichment = () => {
    if (enrichmentController.current) {
      enrichmentController.current.abort();
    }
    setIsPaused(true);
    setIsEnriching(false);
    addLog('⏸️ Enrichment paused', 'info');
  };

  const exportData = () => {
    if (enrichedData.length === 0) {
      addLog('❌ No enriched data to export', 'error');
      return;
    }
    
    const exportFields = [
      'firstName', 'lastName', 'email', 'title', 'company', 'domain',
      'linkedinUrl', 'location', 'phone', 'enrichmentStatus', 'qualityScore'
    ];
    
    const csvContent = [
      exportFields.join(','),
      ...enrichedData.map(row => 
        exportFields.map(field => {
          const value = row[field] || '';
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `apollo_enriched_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addLog(`📁 Exported ${enrichedData.length} enriched contacts`, 'success');
  };

  const loadSampleData = () => {
    setCsvData(sampleData);
    addLog(`📊 Loaded ${sampleData.length} sample contacts for testing`, 'info');
  };

  const clearData = () => {
    setCsvData([]);
    setEnrichedData([]);
    setProgress(0);
    setStats({ processed: 0, successful: 0, failed: 0, qualityScore: 0, duplicates: 0, apiCalls: 0, creditsUsed: 0 });
    addLog('🗑️ Cleared all data', 'info');
  };

  // Theme configuration
  const theme = isDark ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white' : 'bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900';
  const cardBg = isDark ? 'bg-slate-800/70 backdrop-blur-sm border-slate-600/50' : 'bg-white/80 backdrop-blur-sm border-gray-200/50';
  const buttonPrimary = 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200';
  const buttonSecondary = isDark ? 'bg-slate-700/70 hover:bg-slate-600/70 border border-slate-600' : 'bg-gray-100 hover:bg-gray-200 border border-gray-300';

  return (
    <div className={`min-h-screen ${theme} transition-all duration-500`}>
      {/* Header */}
      <div className="border-b border-slate-700/30 backdrop-blur-md bg-black/10">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Apollo Enrichment Studio
                </h1>
                <p className="text-sm text-gray-400 flex items-center space-x-2">
                  <Globe className="w-4 h-4" />
                  <span>Professional Contact Enrichment Platform</span>
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right text-sm">
                <div className="text-gray-400">Credits Used</div>
                <div className="font-semibold text-purple-400">{stats.creditsUsed}</div>
              </div>
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-3 rounded-xl hover:bg-slate-700/50 transition-colors text-2xl"
              >
                {isDark ? '🌙' : '☀️'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        {/* Configuration & Stats Row */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Configuration Panel */}
          <div className={`lg:col-span-2 ${cardBg} border rounded-2xl p-6 shadow-xl`}>
            <div className="flex items-center space-x-2 mb-6">
              <Settings className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold">Configuration</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">Apollo API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Apollo API key..."
                  className={`w-full p-4 rounded-xl border ${isDark ? 'bg-slate-700/50 border-slate-600 focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Batch Size</label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-gray-300'} focus:outline-none`}
                  >
                    <option value={5}>5 contacts</option>
                    <option value={10}>10 contacts</option>
                    <option value={25}>25 contacts</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Retry Attempts</label>
                  <select
                    value={retryAttempts}
                    onChange={(e) => setRetryAttempts(Number(e.target.value))}
                    className={`w-full p-3 rounded-lg border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-gray-300'} focus:outline-none`}
                  >
                    <option value={1}>1 attempt</option>
                    <option value={3}>3 attempts</option>
                    <option value={5}>5 attempts</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-3">Enrichment Options</label>
                <div className="space-y-2">
                  {[
                    { key: 'revealPersonalEmails', label: 'Reveal Personal Emails' },
                    { key: 'revealPhoneNumbers', label: 'Reveal Phone Numbers' },
                    { key: 'includeSocialProfiles', label: 'Include Social Profiles' },
                    { key: 'includeEmploymentHistory', label: 'Include Employment History' }
                  ].map(option => (
                    <label key={option.key} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={enrichmentSettings[option.key]}
                        onChange={(e) => setEnrichmentSettings(prev => ({ ...prev, [option.key]: e.target.checked }))}
                        className="rounded text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm">{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Panel */}
          <div className={`lg:col-span-2 ${cardBg} border rounded-2xl p-6 shadow-xl`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <h2 className="text-xl font-semibold">Live Statistics</h2>
              </div>
              <div className="text-xs text-gray-400">
                {isEnriching ? `Batch ${currentBatch}/${totalBatches}` : 'Ready'}
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{csvData.length}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{stats.successful}</div>
                <div className="text-xs text-gray-400">Success</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
                <div className="text-xs text-gray-400">Failed</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                <div className="text-lg font-bold text-purple-400">{stats.qualityScore}%</div>
                <div className="text-xs text-gray-400">Quality Score</div>
              </div>
              <div className="text-center p-3 bg-orange-500/10 rounded-lg">
                <div className="text-lg font-bold text-orange-400">{stats.apiCalls}</div>
                <div className="text-xs text-gray-400">API Calls</div>
              </div>
            </div>
            
            {progress > 0 && (
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-3">
                  <div 
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full transition-all duration-500 shadow-lg"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Upload & Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Upload Panel */}
          <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
            <div className="flex items-center space-x-2 mb-6">
              <Database className="w-5 h-5 text-purple-400" />
              <h2 className="text-xl font-semibold">Data Upload</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full p-6 border-2 border-dashed ${isDark ? 'border-slate-600 hover:border-slate-500' : 'border-gray-300 hover:border-gray-400'} rounded-xl hover:bg-slate-700/10 transition-all duration-200 flex flex-col items-center justify-center space-y-3`}
                >
                  <Upload className="w-8 h-8 text-gray-400" />
                  <div>
                    <div className="font-medium">Drop your CSV file here</div>
                    <div className="text-sm text-gray-400">or click to browse</div>
                  </div>
                </button>
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={loadSampleData}
                  className={`flex-1 p-3 ${buttonSecondary} rounded-lg text-sm transition-all duration-200 hover:scale-105`}
                >
                  Load Sample Data
                </button>
                <button
                  onClick={clearData}
                  className={`flex-1 p-3 ${buttonSecondary} rounded-lg text-sm transition-all duration-200 hover:scale-105`}
                >
                  Clear All Data
                </button>
              </div>
            </div>
          </div>

          {/* Controls Panel */}
          <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
            <div className="flex items-center space-x-2 mb-6">
              <Users className="w-5 h-5 text-green-400" />
              <h2 className="text-xl font-semibold">Enrichment Controls</h2>
            </div>
            
            <div className="space-y-4">
              <button
                onClick={isEnriching ? pauseEnrichment : startEnrichment}
                disabled={!apiKey.trim() || csvData.length === 0}
                className={`w-full p-4 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${isEnriching ? 'bg-yellow-600 hover:bg-yellow-700' : buttonPrimary}`}
              >
                <div className="flex items-center justify-center space-x-3">
                  {isEnriching ? (
                    <>
                      <Pause className="w-5 h-5" />
                      <span>Pause Enrichment</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span>Start Enrichment</span>
                    </>
                  )}
                </div>
              </button>
              
              <button
                onClick={exportData}
                disabled={enrichedData.length === 0}
                className={`w-full p-4 rounded-xl font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${buttonSecondary}`}
              >
                <div className="flex items-center justify-center space-x-3">
                  <Download className="w-5 h-5" />
                  <span>Export Enriched Data</span>
                </div>
              </button>

              {isEnriching && (
                <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-blue-400 animate-spin mx-auto mb-1" />
                  <div className="text-sm text-blue-400">Processing batch {currentBatch} of {totalBatches}...</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Data Preview Tables */}
        {(csvData.length > 0 || enrichedData.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Original Data */}
            {csvData.length > 0 && (
              <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-blue-400" />
                  <span>Original Data ({csvData.length} contacts)</span>
                </h3>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-700/50 backdrop-blur-sm">
                      <tr>
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Domain</th>
                        <th className="text-left p-3 font-medium">Email</th>
                      </tr>
                    </thead>
                    <tbody className="table-hover">
                      {csvData.map((contact, index) => (
                        <tr key={index} className="border-t border-slate-600/30 hover:bg-slate-600/20">
                          <td className="p-3">{contact.firstName} {contact.lastName}</td>
                          <td className="p-3">{contact.domain}</td>
                          <td className="p-3 text-xs">{contact.email || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Enriched Data */}
            {enrichedData.length > 0 && (
              <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
                <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span>Enriched Data ({enrichedData.length} contacts)</span>
                </h3>
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-700/50 backdrop-blur-sm">
                      <tr>
                        <th className="text-left p-3 font-medium">Name</th>
                        <th className="text-left p-3 font-medium">Title</th>
                        <th className="text-left p-3 font-medium">Company</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="table-hover">
                      {enrichedData.map((contact, index) => (
                        <tr key={index} className="border-t border-slate-600/30 hover:bg-slate-600/20">
                          <td className="p-3">
                            <div>{contact.firstName} {contact.lastName}</div>
                            <div className="text-xs text-gray-400">{contact.email || 'No email'}</div>
                          </td>
                          <td className="p-3">{contact.title || '-'}</td>
                          <td className="p-3">{contact.company || '-'}</td>
                          <td className="p-3">
                            {contact.enrichmentStatus === 'success' ? (
                              <CheckCircle className="w-4 h-4 text-green-400" />
                            ) : contact.enrichmentStatus === 'failed' ? (
                              <XCircle className="w-4 h-4 text-red-400" />
                            ) : (
                              <Clock className="w-4 h-4 text-yellow-400" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Activity Logs */}
        {logs.length > 0 && (
          <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span>Activity Logs</span>
              <span className="text-sm text-gray-400">({logs.length})</span>
            </h3>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`text-sm p-3 rounded-lg flex items-start space-x-3 status-${log.type}`}>
                  <span className="text-xs text-gray-400 mt-0.5 min-w-[60px]">{log.timestamp}</span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApolloEnrichmentStudio;
