import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Play, Pause, Download, Settings, Users, Zap, BarChart3, CheckCircle, XCircle, Clock, Filter, RefreshCw, AlertCircle, TrendingUp, Database, Globe, Sun, Moon } from 'lucide-react';

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

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-19), { id: Date.now(), timestamp, message, type }]);
  }, []);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = parseCSV(e.target.result);
          setCsvData(parsed);
          addLog(`📁 Uploaded ${parsed.length} contacts from ${file.name}`, 'success');
        } catch (error) {
          addLog(`❌ Error parsing CSV: ${error.message}`, 'error');
        }
      };
      reader.readAsText(file);
    }
  };

  const enrichContacts = async () => {
    if (!apiKey || csvData.length === 0) {
      addLog('⚠️ Please provide API key and upload data', 'warning');
      return;
    }

    setIsEnriching(true);
    setEnrichedData([]);
    setProgress(0);
    setCurrentBatch(0);

    const batches = Math.ceil(csvData.length / batchSize);
    setTotalBatches(batches);
    
    addLog(`🚀 Starting enrichment of ${csvData.length} contacts in ${batches} batches`, 'info');

    try {
      for (let i = 0; i < batches; i++) {
        if (isPaused) {
          addLog('⏸️ Enrichment paused', 'warning');
          break;
        }

        const batch = csvData.slice(i * batchSize, (i + 1) * batchSize);
        setCurrentBatch(i + 1);
        
        addLog(`🔄 Processing batch ${i + 1}/${batches} (${batch.length} contacts)`, 'info');

        try {
          // Call Netlify Function
          const response = await fetch('/.netlify/functions/enrich', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              apiKey,
              contacts: batch,
              options: enrichmentSettings
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `HTTP ${response.status}`);
          }

          const result = await response.json();
          
          if (result.success) {
            setEnrichedData(prev => [...prev, ...result.data]);
            addLog(`✅ Batch ${i + 1} completed: ${result.stats.successfulEnrichments} successes, ${result.stats.failedEnrichments} failures`, 'success');
            
            setStats(prev => ({
              ...prev,
              processed: prev.processed + batch.length,
              successful: prev.successful + result.stats.successfulEnrichments,
              failed: prev.failed + result.stats.failedEnrichments,
              apiCalls: prev.apiCalls + 1,
              creditsUsed: prev.creditsUsed + batch.length
            }));
          } else {
            throw new Error(result.message || 'Unknown error');
          }
        } catch (batchError) {
          addLog(`❌ Batch ${i + 1} failed: ${batchError.message}`, 'error');
          
          // Create mock data for failed batch to continue processing
          const mockBatch = batch.map(contact => ({
            ...contact,
            title: null,
            company: null,
            enrichmentStatus: 'failed',
            qualityScore: 0
          }));
          
          setEnrichedData(prev => [...prev, ...mockBatch]);
          setStats(prev => ({
            ...prev,
            processed: prev.processed + batch.length,
            failed: prev.failed + batch.length
          }));
        }

        setProgress(((i + 1) / batches) * 100);
        
        // Add delay between batches to avoid rate limiting
        if (i < batches - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!isPaused) {
        addLog(`✅ Enrichment completed! Processed ${csvData.length} contacts`, 'success');
      }
    } catch (error) {
      addLog(`❌ Enrichment failed: ${error.message}`, 'error');
    } finally {
      setIsEnriching(false);
      setIsPaused(false);
    }
  };

  const pauseEnrichment = () => {
    setIsPaused(!isPaused);
    addLog(isPaused ? '▶️ Resuming enrichment' : '⏸️ Pausing enrichment', 'info');
  };

  const exportData = () => {
    if (enrichedData.length === 0) {
      addLog('⚠️ No enriched data to export', 'warning');
      return;
    }

    const headers = ['firstName', 'lastName', 'email', 'domain', 'title', 'company', 'linkedinUrl', 'workEmail', 'personalEmail', 'directPhone', 'mobilePhone', 'industry', 'location', 'qualityScore', 'enrichmentStatus'];
    const csvContent = [
      headers.join(','),
      ...enrichedData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
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
    setLogs([]);
    addLog('🗑️ Cleared all data', 'info');
  };

  // Theme configuration
  const theme = isDark 
    ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white' 
    : 'bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900';
  
  const cardBg = isDark 
    ? 'bg-slate-800/70 backdrop-blur-sm border-slate-600/50' 
    : 'bg-white/80 backdrop-blur-sm border-gray-200/50';
  
  const inputBg = isDark 
    ? 'bg-slate-700/50 border-slate-600 focus:border-blue-500 text-white' 
    : 'bg-white border-gray-300 focus:border-blue-500 text-gray-900';

  return (
    <div className={`min-h-screen ${theme} transition-all duration-500`}>
      {/* Header */}
      <div className={`border-b ${isDark ? 'border-slate-700/30' : 'border-gray-300/30'} backdrop-blur-md ${isDark ? 'bg-black/10' : 'bg-white/10'}`}>
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
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center space-x-2`}>
                  <Globe className="w-4 h-4" />
                  <span>Professional Contact Enrichment Platform</span>
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right text-sm">
                <div className={isDark ? 'text-gray-400' : 'text-gray-600'}>Credits Used</div>
                <div className="font-semibold text-purple-400">{stats.creditsUsed}</div>
              </div>
              <button
                onClick={() => setIsDark(!isDark)}
                className={`p-3 rounded-xl ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-gray-200/50'} transition-colors text-2xl`}
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
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
                  className={`w-full p-4 rounded-xl border ${inputBg} focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Batch Size</label>
                  <select
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    className={`w-full p-3 rounded-lg border ${inputBg} focus:outline-none`}
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
                    className={`w-full p-3 rounded-lg border ${inputBg} focus:outline-none`}
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
              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {isEnriching ? 'Processing...' : 'Ready'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Ready</span>
                  <span className="font-semibold text-blue-400">{csvData.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total</span>
                  <span className="font-semibold">{csvData.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Success</span>
                  <span className="font-semibold text-green-400">{stats.successful}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Failed</span>
                  <span className="font-semibold text-red-400">{stats.failed}</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Quality Score</span>
                  <span className="font-semibold text-purple-400">
                    {stats.successful > 0 ? Math.round((stats.successful / (stats.successful + stats.failed)) * 100) : 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>API Calls</span>
                  <span className="font-semibold text-yellow-400">{stats.apiCalls}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Credits Used</span>
                  <span className="font-semibold text-orange-400">{stats.creditsUsed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Progress</span>
                  <span className="font-semibold text-blue-400">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            {isEnriching && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-2">
                  <span>Batch {currentBatch}/{totalBatches}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className={`h-2 ${isDark ? 'bg-slate-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Data Upload Section */}
        <div className={`${cardBg} border rounded-2xl p-6 shadow-xl mb-8`}>
          <div className="flex items-center space-x-2 mb-6">
            <Database className="w-5 h-5 text-green-400" />
            <h2 className="text-xl font-semibold">Data Upload</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upload Area */}
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full p-8 border-2 border-dashed ${isDark ? 'border-slate-600 hover:border-blue-500' : 'border-gray-300 hover:border-blue-500'} rounded-xl transition-colors flex flex-col items-center space-y-4 ${isDark ? 'hover:bg-slate-700/20' : 'hover:bg-blue-50'}`}
              >
                <Upload className="w-10 h-10 text-blue-400" />
                <div className="text-center">
                  <p className="font-semibold">Drop your CSV file here</p>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                    or click to browse
                  </p>
                </div>
              </button>
            </div>

            {/* Actions */}
            <div className="flex flex-col space-y-4">
              <button
                onClick={loadSampleData}
                className={`flex items-center justify-center space-x-2 p-4 ${isDark ? 'bg-slate-700/50 hover:bg-slate-600/50' : 'bg-gray-100 hover:bg-gray-200'} rounded-xl transition-colors`}
              >
                <Users className="w-5 h-5" />
                <span>Load Sample Data</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={isEnriching ? pauseEnrichment : enrichContacts}
                  disabled={csvData.length === 0 || !apiKey}
                  className="flex items-center justify-center space-x-2 p-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-600 text-white rounded-xl transition-all disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
                >
                  {isEnriching ? (
                    isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  <span>{isEnriching ? (isPaused ? 'Resume' : 'Pause') : 'Start'}</span>
                </button>

                <button
                  onClick={exportData}
                  disabled={enrichedData.length === 0}
                  className={`flex items-center justify-center space-x-2 p-3 ${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} disabled:bg-gray-600 text-white rounded-xl transition-all disabled:cursor-not-allowed`}
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>

              <button
                onClick={clearData}
                className={`flex items-center justify-center space-x-2 p-3 ${isDark ? 'bg-red-600/20 hover:bg-red-600/30 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600'} rounded-xl transition-colors`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Clear All</span>
              </button>
            </div>
          </div>
        </div>

        {/* Data Tables & Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Original Data */}
          {csvData.length > 0 && (
            <div className={`${cardBg} border rounded-2xl p-6 shadow-xl`}>
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Filter className="w-5 h-5 text-blue-400" />
                <span>Original Data ({csvData.length} contacts)</span>
              </h3>
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className={`sticky top-0 ${isDark ? 'bg-slate-700/50' : 'bg-gray-100/50'} backdrop-blur-sm`}>
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Domain</th>
                      <th className="text-left p-3 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.map((contact, index) => (
                      <tr key={index} className={`border-t ${isDark ? 'border-slate-600/30 hover:bg-slate-600/20' : 'border-gray-200/30 hover:bg-gray-50'} transition-colors`}>
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
                  <thead className={`sticky top-0 ${isDark ? 'bg-slate-700/50' : 'bg-gray-100/50'} backdrop-blur-sm`}>
                    <tr>
                      <th className="text-left p-3 font-medium">Name</th>
                      <th className="text-left p-3 font-medium">Title</th>
                      <th className="text-left p-3 font-medium">Company</th>
                      <th className="text-left p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedData.map((contact, index) => (
                      <tr key={index} className={`border-t ${isDark ? 'border-slate-600/30 hover:bg-slate-600/20' : 'border-gray-200/30 hover:bg-gray-50'} transition-colors`}>
                        <td className="p-3">
                          <div>{contact.firstName} {contact.lastName}</div>
                          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{contact.workEmail || contact.email || 'No email'}</div>
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

        {/* Activity Logs */}
        {logs.length > 0 && (
          <div className={`${cardBg} border rounded-2xl p-6 shadow-xl mt-8`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              <span>Activity Logs</span>
              <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>({logs.length})</span>
            </h3>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
              {logs.map((log) => (
                <div key={log.id} className={`text-sm p-3 rounded-lg flex items-start space-x-3 ${
                  log.type === 'success' ? (isDark ? 'text-green-400 bg-green-900/20 border border-green-500/20' : 'text-green-600 bg-green-50 border border-green-200') :
                  log.type === 'error' ? (isDark ? 'text-red-400 bg-red-900/20 border border-red-500/20' : 'text-red-600 bg-red-50 border border-red-200') :
                  log.type === 'warning' ? (isDark ? 'text-yellow-400 bg-yellow-900/20 border border-yellow-500/20' : 'text-yellow-600 bg-yellow-50 border border-yellow-200') :
                  (isDark ? 'text-blue-400 bg-blue-900/20 border border-blue-500/20' : 'text-blue-600 bg-blue-50 border border-blue-200')
                }`}>
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5 min-w-[60px]`}>{log.timestamp}</span>
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
