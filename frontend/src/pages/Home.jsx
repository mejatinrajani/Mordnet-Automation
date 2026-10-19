import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  UploadCloud, Play, FileSpreadsheet, X, Activity, 
  CheckCircle2, AlertCircle, RefreshCw, Info,
  Menu, Download, Plus, History, ChevronRight, FileText, ChevronLeft, Loader2,
  Pin, Edit2, Trash2, Check, Search, Filter, Ban
} from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const scrollbarHide = "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]";

export default function Home() {
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState('new'); 
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  
  const [editingId, setEditingId] = useState(null);
  const [editTitleValue, setEditTitleValue] = useState("");

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); 
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState([]);
  const [liveResults, setLiveResults] = useState([]);
  const fileInputRef = useRef(null);

  // Filtering State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showNameModal, setShowNameModal] = useState(false);
  const [runTitle, setRunTitle] = useState("");

  // Prevent accidental page reload while processing
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (status === 'processing') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [status]);

  const fetchHistoricalSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from('automation_runs')
        .select(`
          id, filename, title, is_pinned, total_locations, created_at,
          automation_results ( product_name, location_text, pincode, latitude, longitude, status )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedSessions = data.map(run => ({
        id: run.id,
        title: run.title || `Run - ${run.filename}`,
        is_pinned: run.is_pinned,
        date: new Date(run.created_at).toLocaleString(),
        exit_code: '0 (Success)', 
        total_locations: run.total_locations,
        created_at: run.created_at,
        results: run.automation_results.map(r => ({
          Product_Name: r.product_name, 
          Location: r.location_text,
          Pincode: r.pincode,
          Latitude: r.latitude, 
          Longitude: r.longitude, 
          status: r.status
        }))
      }));

      setSessions(formattedSessions);
      if (selectedSession) {
        const updated = formattedSessions.find(s => s.id === selectedSession.id);
        if (updated) setSelectedSession(updated);
      }
    } catch (error) {
      console.error("Error fetching sessions:", error.message);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => { fetchHistoricalSessions(); }, []);

  // --- Handlers ---
  const handleViewChange = (view, session = null) => {
    setSearchTerm("");
    setStatusFilter("All");
    setActiveView(view);
    setSelectedSession(session);

    // Wipes the engine slate clean for a new run (unless it's actively processing)
    if (view === 'new' && status !== 'processing') {
      setFile(null);
      setStatus('idle');
      setProgress(0);
      setLogs([]);
      setLiveResults([]);
    }
  };

  const togglePin = async (id, currentPinState) => {
    await supabase.from('automation_runs').update({ is_pinned: !currentPinState }).eq('id', id);
    fetchHistoricalSessions();
  };

  const deleteSession = async (id) => {
    if(!window.confirm("Are you sure you want to delete this extraction log?")) return;
    await supabase.from('automation_runs').delete().eq('id', id);
    if(selectedSession?.id === id) setActiveView('new');
    fetchHistoricalSessions();
  };

  const saveTitleEdit = async (id) => {
    if(!editTitleValue.trim()) return setEditingId(null);
    await supabase.from('automation_runs').update({ title: editTitleValue }).eq('id', id);
    setEditingId(null);
    fetchHistoricalSessions();
  };

  const handleFile = (selected) => {
    if (selected && (selected.name.endsWith('.xlsx') || selected.name.endsWith('.csv'))) {
      setFile(selected); setStatus('idle'); setProgress(0); setLogs([]); setLiveResults([]);
      setSearchTerm(""); setStatusFilter("All");
    } else {
      alert('Please upload a valid .xlsx or .csv master spreadsheet');
    }
  };

  const startAutomation = async (customTitle) => { // <--- Accept Title
    if (!file) return;
    setStatus('processing');
    setLogs([{ time: new Date().toLocaleTimeString(), msg: 'Establishing live socket with FastAPI engine...' }]);
    setLiveResults([]); setProgress(0); setSearchTerm(""); setStatusFilter("All");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', 'user_123'); 
    formData.append('title', customTitle); // <--- Send Title to Backend

    try {
      const response = await fetch('http://localhost:8000/api/scan', { method: 'POST', body: formData });
      if (!response.ok) throw new Error("Backend connection failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); 

        for (const line of lines) {
          if (line.trim() === "") continue;
          const parsed = JSON.parse(line);

          if (parsed.type === "init") {
            setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Pipeline open. Target size: ${parsed.total_locations} locations.` }, ...prev]);
            
            // INSTANT SIDEBAR REFRESH: Fetch sessions the millisecond the DB record is created
            fetchHistoricalSessions(); 

          } else if (parsed.type === "result") {
            setLiveResults(prev => [parsed.data, ...prev]);
            setProgress(parsed.progress);
            setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Validated ${parsed.data.Location} - ${parsed.data.Product_Name}: ${parsed.data.status}` }, ...prev].slice(0, 50));
          } else if (parsed.type === "complete") {
            setProgress(100); setStatus('completed');
            setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Pipeline execution finished. Disconnecting stream.` }, ...prev]);
            await fetchHistoricalSessions(); 
          }
        }
      }
    } catch (error) {
      setStatus('idle');
      alert("Stream interrupted: " + error.message);
    }
  };

  const exportToExcel = (sessionData, title) => {
    if (!sessionData || sessionData.length === 0) return;
    const headers = ["Product_Name,Location,Pincode,Latitude,Longitude,Status"];
    const rows = sessionData.map(row => `"${row.Product_Name}","${row.Location}","${row.Pincode}",${row.Latitude || ''},${row.Longitude || ''},"${row.status}"`);
    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `${title.replace(/\s+/g, '_')}_Results.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  // --- UI Helpers ---
  const getStatusTooltip = (val) => {
    if (val.includes('Yes')) return "Available: The item is currently in stock at the assigned dark store for this coordinate.";
    if (val.includes('Out of Stock')) return "Out of Stock: The item is listed in this area but current inventory is 0.";
    if (val.includes('Not in results') || val.includes('Not Found') || val.includes('Empty Results')) return "Not Found: The item does not exist or is completely unmapped in this specific region.";
    if (val.includes('Unserviceable')) return "Unserviceable: These GPS coordinates fall completely outside of Blinkit's operational delivery radius.";
    return "Status code directly from the HTTP response.";
  };

  const renderStatusBadge = (value) => {
    let badge = <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">{value}</span>;
    
    if (value.includes('Yes')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Available</span>;
    } else if (value.includes('Out of Stock')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"><AlertCircle className="w-3 h-3" /> Out of Stock</span>;
    } else if (value.includes('Not in results') || value.includes('Not Found') || value.includes('Empty Results')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"><X className="w-3 h-3" /> Not Found</span>;
    } else if (value.includes('Unserviceable')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20"><Ban className="w-3 h-3" /> Unserviceable</span>;
    }

    return (
      <div className="flex items-center gap-2 group/tooltip relative cursor-help w-max">
        {badge}
        <Info className="w-3.5 h-3.5 text-zinc-600 group-hover/tooltip:text-zinc-300 transition-colors shrink-0" />
        <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-zinc-800 text-zinc-200 text-xs leading-relaxed text-left rounded-lg shadow-xl border border-zinc-700 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50">
          {getStatusTooltip(value)}
        </div>
      </div>
    );
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const displayedResults = (activeView === 'session' ? selectedSession?.results : liveResults)?.filter(item => {
    const matchesSearch = item.Product_Name?.toLowerCase().includes(searchTerm.toLowerCase()) || item.Location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  }) || [];

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden selection:bg-blue-500/30 selection:text-blue-200">
      
      {/* Sidebar */}
      <aside className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-800/80 bg-zinc-950/50 backdrop-blur-xl relative ${isSidebarOpen ? 'w-80' : 'w-0'}`}>
        <div className={`w-80 h-full flex flex-col transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}`}>
          <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" /> Dispatcher</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
          </div>

          <div className="p-4">
            <button onClick={() => handleViewChange('new')} className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'new' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-800'}`}>
              {status === 'processing' ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> View Active Pipeline</>
              ) : (
                <><Plus className="w-4 h-4" /> New Automation Run</>
              )}
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${scrollbarHide}`}>
            <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-4 px-2 flex items-center justify-between">
              <span className="flex items-center gap-2"><History className="w-3.5 h-3.5" /> Session History</span>
              {isLoadingSessions && <Loader2 className="w-3 h-3 animate-spin text-zinc-500" />}
            </h3>
            
            {sortedSessions.map(session => (
              <div key={session.id} className={`group relative w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${activeView === 'session' && selectedSession?.id === session.id ? 'bg-zinc-800/50 border-blue-500/50' : 'bg-zinc-900/20 border-zinc-800/50 hover:bg-zinc-800/50 hover:border-zinc-700'}`} onClick={() => handleViewChange('session', session)}>
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800/90 backdrop-blur rounded-md border border-zinc-700 p-0.5 shadow-lg">
                  <button onClick={(e) => { e.stopPropagation(); togglePin(session.id, session.is_pinned); }} className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-700"><Pin className={`w-3.5 h-3.5 ${session.is_pinned ? 'fill-blue-500 text-blue-500' : ''}`} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setEditingId(session.id); setEditTitleValue(session.title); }} className="p-1.5 text-zinc-400 hover:text-white rounded hover:bg-zinc-700"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="p-1.5 text-zinc-400 hover:text-rose-400 rounded hover:bg-zinc-700"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>

                <div className="flex flex-col gap-1 pr-8">
                  {editingId === session.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input autoFocus value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTitleEdit(session.id)} className="bg-zinc-950 border border-blue-500/50 text-white text-sm rounded px-2 py-1 w-full outline-none" />
                      <button onClick={() => saveTitleEdit(session.id)} className="p-1 text-emerald-400 hover:bg-zinc-800 rounded"><Check className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <span className="font-medium text-sm text-zinc-200 truncate flex items-center gap-1.5">
                      {session.is_pinned && <Pin className="w-3 h-3 fill-zinc-500 text-zinc-500" />} {session.title}
                    </span>
                  )}
                  <p className="text-xs text-zinc-500">{session.date}</p>
                  <span className="text-[10px] text-zinc-400 font-mono mt-1">{session.total_locations} Locs Validated</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 h-full overflow-y-auto relative ${scrollbarHide}`}>
        {!isSidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-6 left-6 p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 z-10 shadow-lg"><Menu className="w-5 h-5" /></button>
        )}

        <div className={`max-w-5xl mx-auto p-8 lg:p-12 transition-all ${!isSidebarOpen ? 'pl-24' : ''}`}>
          
          {activeView === 'new' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="border-b border-zinc-800/80 pb-6">
                <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Configure Engine</h1>
                <p className="text-sm text-zinc-400 mt-2">Upload target locations and dispatch the extraction pipeline.</p>
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
                          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">Location</span> +
                          <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">Product_Name</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4">
                      <div className="flex items-center gap-3.5">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"><FileSpreadsheet className="w-6 h-6" /></div>
                        <div><h4 className="text-sm font-medium text-zinc-200 leading-tight">{file.name}</h4></div>
                      </div>
                      {status === 'idle' && <button onClick={() => setFile(null)} className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 rounded-lg"><X className="w-4 h-4" /></button>}
                    </div>

                    {status === 'idle' && (
                      <button 
                        onClick={() => {
                          const now = new Date();
                          setRunTitle(`Automation Run - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`);
                          setShowNameModal(true);
                        }} 
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/15"
                      >
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
                        <div className={`bg-zinc-950/90 border border-zinc-800/80 rounded-2xl p-4 font-mono text-xs text-zinc-400 h-32 overflow-y-auto space-y-1.5 shadow-inner ${scrollbarHide}`}>
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
            </div>
          )}

          {/* TABLE RENDERING */}
          {(liveResults.length > 0 || (activeView === 'session' && selectedSession)) && (
            <div className="mt-8 border border-zinc-800/80 bg-zinc-900/30 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                      {activeView === 'session' ? <FileText className="w-5 h-5 text-blue-400" /> : <Activity className="w-5 h-5 text-emerald-400" />}
                      {activeView === 'session' ? selectedSession.title : 'Live Catalog Stream'}
                    </h3>
                    {activeView === 'session' && <span className="text-xs text-zinc-500 mt-1 block">{selectedSession.date}</span>}
                  </div>
                  
                  <button onClick={() => exportToExcel(activeView === 'session' ? selectedSession.results : liveResults, activeView === 'session' ? selectedSession.title : 'Live_Run')} className="bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors self-start sm:self-auto">
                    <Download className="w-4 h-4" /> Export Excel/CSV
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input type="text" placeholder="Search products or locations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-colors" />
                  </div>
                  <div className="relative">
                    <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-8 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500/50 transition-colors cursor-pointer">
                      <option value="All">All Statuses</option>
                      <option value="Yes">Available (Yes)</option>
                      <option value="Currently Out of Stock">Out of Stock</option>
                      <option value="Not Found">Not Found</option>
                      <option value="Unserviceable">Unserviceable</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className={`overflow-x-auto ${scrollbarHide}`}>
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800/60 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4 font-medium">Product Name</th>
                      <th className="px-6 py-4 font-medium">Location</th>
                      <th className="px-6 py-4 font-medium">Pincode</th>
                      <th className="px-6 py-4 font-medium">Latitude</th>
                      <th className="px-6 py-4 font-medium">Longitude</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/40 text-zinc-300 font-mono">
                    {displayedResults.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-6 py-4 font-sans font-medium text-zinc-100">{item.Product_Name}</td>
                        <td className="px-6 py-4 text-zinc-300 truncate max-w-[150px]" title={item.Location}>{item.Location || 'N/A'}</td>
                        <td className="px-6 py-4 text-zinc-400 font-mono">{item.Pincode || 'N/A'}</td>
                        <td className="px-6 py-4 text-zinc-500">{item.Latitude ? item.Latitude.toFixed(4) : 'N/A'}</td>
                        <td className="px-6 py-4 text-zinc-500">{item.Longitude ? item.Longitude.toFixed(4) : 'N/A'}</td>
                        <td className="px-6 py-4">{renderStatusBadge(item.status)}</td>
                      </tr>
                    ))}
                    {displayedResults.length === 0 && (
                      <tr><td colSpan="6" className="text-center py-8 text-zinc-500 font-sans">No matching records found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* SESSION NAMING MODAL */}
        {showNameModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-zinc-100 mb-2">Name this Dispatch Session</h3>
              <p className="text-sm text-zinc-400 mb-5">Assign a name so you can easily find this extraction in your history logs later.</p>
              
              <input 
                type="text" 
                value={runTitle} 
                onChange={(e) => setRunTitle(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 focus:border-blue-500 rounded-xl px-4 py-3 text-zinc-100 outline-none transition-colors mb-6"
                placeholder="e.g., Delhi NCR Q3 Analysis"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && runTitle.trim()) {
                    setShowNameModal(false);
                    startAutomation(runTitle.trim());
                  }
                }}
              />
              
              <div className="flex items-center justify-end gap-3">
                <button 
                  onClick={() => setShowNameModal(false)} 
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if(!runTitle.trim()) { alert("Please provide a name to continue."); return; }
                    setShowNameModal(false);
                    startAutomation(runTitle.trim());
                  }} 
                  className="px-5 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all"
                >
                  Start Pipeline
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}