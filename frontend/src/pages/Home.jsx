import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  UploadCloud, Play, FileSpreadsheet, X, Activity, 
  CheckCircle2, AlertCircle, ShieldCheck, RefreshCw, Info,
  Menu, Download, Plus, History, ChevronRight, FileText, ChevronLeft, Loader2
} from 'lucide-react';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function Home() {
  // Navigation & Layout State
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState('new'); // 'new' | 'session'
  const [selectedSession, setSelectedSession] = useState(null);
  
  // Real Database State
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  // Automation Engine State
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); 
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [liveResults, setLiveResults] = useState([]);
  const fileInputRef = useRef(null);

  // --- Fetch Historical Sessions from Supabase ---
  const fetchHistoricalSessions = async () => {
    setIsLoadingSessions(true);
    try {
      // Fetch runs and their nested results via Supabase's foreign key relationship
      const { data, error } = await supabase
        .from('automation_runs')
        .select(`
          id,
          filename,
          total_locations,
          created_at,
          automation_results (
            product_name,
            latitude,
            longitude,
            status
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Format the DB data to match our UI requirements
      const formattedSessions = data.map(run => ({
        id: run.id,
        title: `Run - ${run.filename}`,
        date: new Date(run.created_at).toLocaleString(),
        exit_code: '0 (Success)', // Can be dynamically mapped if error states are stored in DB
        total_locations: run.total_locations,
        results: run.automation_results.map(r => ({
          Product_Name: r.product_name,
          Latitude: r.latitude,
          Longitude: r.longitude,
          status: r.status
        }))
      }));

      setSessions(formattedSessions);
    } catch (error) {
      console.error("Error fetching sessions:", error.message);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  // Load history on component mount
  useEffect(() => {
    fetchHistoricalSessions();
  }, []);

  // --- Handlers ---
  const handleFile = (selected) => {
    if (selected && (selected.name.endsWith('.xlsx') || selected.name.endsWith('.csv'))) {
      setFile(selected);
      setStatus('idle'); setProgress(0); setLogs([]); setLiveResults([]);
    } else {
      alert('Please upload a valid .xlsx or .csv master spreadsheet');
    }
  };

  const startAutomation = async () => {
    if (!file) return;
    setStatus('processing');
    setLogs([{ time: new Date().toLocaleTimeString(), msg: 'Uploading file to FastAPI engine...' }]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', 'user_123'); // In production, grab this from Auth context

    try {
      const response = await fetch('http://localhost:8000/api/scan', { 
        method: 'POST', 
        body: formData 
      });
      
      if (!response.ok) throw new Error("Backend connection failed");

      setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: 'Job running on server. Awaiting DB insertion...' }, ...prev]);
      setProgress(50);

      const data = await response.json();
      
      setLiveResults(data.results);
      setProgress(100);
      setStatus('completed');
      setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Success! Records saved.` }, ...prev]);

      // Re-fetch the sessions from Supabase to guarantee our sidebar is 100% in sync with the database
      await fetchHistoricalSessions();

    } catch (error) {
      setStatus('idle');
      alert("Error connecting to backend: " + error.message);
    }
  };

  const exportToExcel = (sessionData, title) => {
    if (!sessionData || sessionData.length === 0) return;
    
    // Build CSV string natively
    const headers = ["Product_Name,Latitude,Longitude,Status"];
    const rows = sessionData.map(row => `"${row.Product_Name}",${row.Latitude},${row.Longitude},"${row.status}"`);
    const csvContent = [headers, ...rows].join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${title.replace(/\s+/g, '_')}_Results.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- UI Helpers ---
  const renderStatusBadge = (value) => {
    switch (value) {
      case 'Yes': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Available</span>;
      case 'No': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><AlertCircle className="w-3 h-3" /> Out of Stock</span>;
      case 'Unserviceable': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">Unserviceable</span>;
      default: return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">{value}</span>;
    }
  };

  return (
    <div className="flex h-screen bg-zinc-950 no-scrollbar text-zinc-100 font-sans overflow-hidden selection:bg-blue-500/30 selection:text-blue-200">
      
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} flex-shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-800/80 bg-zinc-950/50 backdrop-blur-xl flex flex-col relative`}>
        <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between min-w-[320px]">
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" /> Dispatcher
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 min-w-[320px]">
          <button 
            onClick={() => setActiveView('new')}
            className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'new' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'}`}
          >
            <Plus className="w-4 h-4" /> New Automation Run
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-w-[320px] p-4 space-y-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2 flex items-center justify-between">
            <span className="flex items-center gap-2"><History className="w-3.5 h-3.5" /> Session History</span>
            {isLoadingSessions && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
          </h3>
          
          {sessions.length === 0 && !isLoadingSessions && (
            <p className="text-xs text-zinc-600 px-2 italic">No past sessions found.</p>
          )}

          {sessions.map(session => (
            <button
              key={session.id}
              onClick={() => { setActiveView('session'); setSelectedSession(session); }}
              className={`w-full text-left p-4 rounded-xl border transition-all ${activeView === 'session' && selectedSession?.id === session.id ? 'bg-zinc-800/50 border-blue-500/50' : 'bg-zinc-900/20 border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700'}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm text-zinc-200 truncate pr-2">{session.title}</span>
                <ChevronRight className="w-4 h-4 text-zinc-600 shrink-0" />
              </div>
              <p className="text-xs text-zinc-500 mb-3">{session.date}</p>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${session.exit_code.includes('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  Exit: {session.exit_code}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">{session.total_locations} Locs</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 h-full overflow-y-auto relative">
        {!isSidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute top-6 left-6 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 z-10 shadow-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className={`max-w-5xl mx-auto p-8 lg:p-12 transition-all ${!isSidebarOpen ? 'pl-24' : ''}`}>
          
          {/* VIEW: NEW AUTOMATION */}
          {activeView === 'new' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="border-b border-zinc-800/80 pb-6">
                <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Configure Engine</h1>
                <p className="text-sm text-zinc-400 mt-2">Upload coordinates and dispatch the extraction pipeline.</p>
              </div>

              <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
                {!file ? (
                  <div className="space-y-4">
                    <div onClick={() => fileInputRef.current?.click()} className="group cursor-pointer border-2 border-dashed border-zinc-800 hover:border-blue-500/50 bg-zinc-950/40 hover:bg-zinc-950/80 rounded-2xl p-10 flex flex-col items-center justify-center transition-all">
                      <div className="h-14 w-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center group-hover:scale-105 group-hover:border-zinc-700 transition-all">
                        <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-blue-400" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-zinc-200">Upload Target Locations</h3>
                      <input ref={fileInputRef} type="file" accept=".xlsx, .csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-medium text-blue-400">Required File Format</h4>
                        <p className="text-xs text-zinc-400 mt-1 mb-2">Column headers must explicitly match:</p>
                        <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">Latitude</span> +
                          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">Longitude</span> +
                          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">Product_Name</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4">
                      <div className="flex items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-zinc-200 leading-tight">{file.name}</h4>
                        </div>
                      </div>
                      {status === 'idle' && (
                        <button onClick={() => setFile(null)} className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-lg">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {status === 'idle' && (
                      <button onClick={startAutomation} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15">
                        <Play className="w-4 h-4 fill-current" /> Execute Pipeline
                      </button>
                    )}

                    {status !== 'idle' && (
                      <div className="space-y-6 pt-2">
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs font-medium">
                            <span className={status === 'completed' ? 'text-emerald-400' : 'text-blue-400 flex items-center gap-2'}>
                              {status !== 'completed' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                              {status === 'completed' ? 'Execution Finished' : 'Processing on Server...'}
                            </span>
                            <span className="text-zinc-400 font-mono">{progress}%</span>
                          </div>
                          <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/80">
                            <div className={`h-full transition-all duration-300 ease-out ${status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                        <div className="bg-zinc-950/90 border border-zinc-800/80 rounded-2xl p-4 font-mono text-xs text-zinc-400 h-32 overflow-y-auto space-y-1.5 shadow-inner">
                          {logs.map((log, index) => (
                            <div key={index} className="flex gap-3 leading-relaxed">
                              <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                              <span className={index === 0 && status === 'completed' ? 'text-emerald-400' : 'text-zinc-300'}>{log.msg}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Run Table */}
              {liveResults.length > 0 && (
                <div className="border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200">Catalog Stream Results</h3>
                    <button onClick={() => exportToExcel(liveResults, file?.name || 'Live_Run')} className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-xs flex items-center gap-2">
                      <Download className="w-3.5 h-3.5" /> Export Data
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800/60 uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-3.5 font-medium">Product Name</th>
                          <th className="px-6 py-3.5 font-medium">Latitude</th>
                          <th className="px-6 py-3.5 font-medium">Longitude</th>
                          <th className="px-6 py-3.5 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-mono">
                        {liveResults.map((item, idx) => (
                          <tr key={idx} className="hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-3.5 font-sans font-medium text-zinc-100">{item.Product_Name}</td>
                            <td className="px-6 py-3.5 text-zinc-400">{item.Latitude}</td>
                            <td className="px-6 py-3.5 text-zinc-400">{item.Longitude}</td>
                            <td className="px-6 py-3.5">{renderStatusBadge(item.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW: PAST SESSION DETAILS */}
          {activeView === 'session' && selectedSession && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
                <div>
                  <h1 className="text-3xl font-bold text-zinc-100 tracking-tight flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-400" />
                    {selectedSession.title}
                  </h1>
                  <div className="flex items-center gap-4 mt-3">
                    <span className="text-sm text-zinc-400">{selectedSession.date}</span>
                    <span className="text-zinc-700">•</span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${selectedSession.exit_code.includes('Success') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                      Exit Code: {selectedSession.exit_code}
                    </span>
                  </div>
                </div>
                
                <button onClick={() => exportToExcel(selectedSession.results, selectedSession.title)} className="bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                  <Download className="w-4 h-4" /> Export as Excel/CSV
                </button>
              </div>

              <div className="border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl">
                <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
                  <h3 className="text-sm font-semibold text-zinc-200">Session Results</h3>
                  <span className="text-xs text-zinc-400 font-mono">{selectedSession.results.length} locations verified</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800/60 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-medium">Product Name</th>
                        <th className="px-6 py-4 font-medium">Latitude</th>
                        <th className="px-6 py-4 font-medium">Longitude</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-mono">
                      {selectedSession.results.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-800/20 transition-colors">
                          <td className="px-6 py-4 font-sans font-medium text-zinc-100">{item.Product_Name}</td>
                          <td className="px-6 py-4 text-zinc-400">{item.Latitude}</td>
                          <td className="px-6 py-4 text-zinc-400">{item.Longitude}</td>
                          <td className="px-6 py-4">{renderStatusBadge(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}