import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  UploadCloud, Play, FileSpreadsheet, X, Activity, 
  CheckCircle2, AlertCircle, RefreshCw, Info,
  Menu, Download, Plus, History, FileText, ChevronLeft, Loader2,
  Pin, Edit2, Trash2, Check, Search, Filter, Ban, Eye, EyeOff,
  Sun, Moon // Added for Theme Toggle
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
  const [selectedOperator, setSelectedOperator] = useState("");
  const [passkey, setPasskey] = useState("");
  const [showPasskey, setShowPasskey] = useState(false);
  const teamMembers = ["Shanky Saxena", "Neetu Sharma", "Arohi Singh", "Aryan", "Jatin Rajani"];

  const [backendStatus, setBackendStatus] = useState("unknown");
  const [isWaking, setIsWaking] = useState(false);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

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
          id, filename, title, is_pinned, total_locations, created_at, operator_name,
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
        operator: run.operator_name || "Unknown",
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

  const wakeSystemUp = async () => {
    setIsWaking(true);
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    
    try {
      const response = await fetch(`${backendUrl}/api/health`, { method: 'GET' });
      if (response.ok) {
        setBackendStatus("awake");
      } else {
         setBackendStatus("asleep");
      }
    } catch (error) {
      console.error("Health check failed:", error);
      setBackendStatus("asleep");
    } finally {
      setIsWaking(false);
    }
  };

  const startAutomation = async (customTitle, operator, key) => { 
    if (!file) return;

    try {
      // 1. Read and parse the uploaded Excel/CSV file entirely in the browser
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // defval: "" ensures that empty cells are read as empty strings, not skipped entirely
      const allRows = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); 

      // ==========================================
      // --- PRE-FLIGHT DATA VALIDATION STAGE ---
      // ==========================================
      if (!allRows.length) {
        alert("Validation Failed: The uploaded file is completely empty.");
        return; 
      }

      // Validate exact headers exist
      const actualHeaders = Object.keys(allRows[0]);
      if (!actualHeaders.includes("Location") || !actualHeaders.includes("Product_Name")) {
        alert("Validation Failed: The file must contain exactly 'Location' and 'Product_Name' as column headers. Check for typos or extra spaces.");
        return; 
      }

      // Scan all rows for empty cells or corrupted data
      const corruptRows = [];
      allRows.forEach((row, index) => {
        const loc = String(row.Location).trim();
        const prod = String(row.Product_Name).trim();
        
        // If either column is blank/missing
        if (!loc || !prod) {
          corruptRows.push(index + 2); // +2 because index 0 is Excel row 2 (row 1 is headers)
        }
      });

      if (corruptRows.length > 0) {
        const rowList = corruptRows.slice(0, 5).join(", ");
        const extra = corruptRows.length > 5 ? ' (and more)' : '';
        alert(`Validation Failed: Missing data detected on Excel row(s): ${rowList}${extra}. Every row must have both a Location and Product_Name.`);
        return; // Halt the entire process before it even touches the backend
      }
      // ==========================================
      // --- END VALIDATION ---
      // ==========================================

      // If data is perfect, begin the UI state transitions
      setStatus('processing');
      setLogs([{ time: new Date().toLocaleTimeString(), msg: 'Data validated successfully. Preparing smart batches...' }]);
      setLiveResults([]); setProgress(0); setSearchTerm(""); setStatusFilter("All");

      const totalLocations = allRows.length;
      const batchSize = 30; // Smart chunking size
      let completedLocations = 0;

      setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Loaded ${totalLocations} valid rows. Splitting into ${Math.ceil(totalLocations / batchSize)} secure batches.` }, ...prev]);

      // 2. Process sequentially in batches
      for (let i = 0; i < totalLocations; i += batchSize) {
        const chunk = allRows.slice(i, i + batchSize);
        
        const headers = ["Location", "Product_Name"];
        const csvRows = chunk.map(row => `"${row.Location}","${row.Product_Name}"`);
        const csvString = [headers.join(','), ...csvRows].join('\n');
        
        const chunkBlob = new Blob([csvString], { type: 'text/csv' });
        const chunkFile = new File([chunkBlob], `batch_${i / batchSize + 1}.csv`, { type: 'text/csv' });

        const formData = new FormData();
        formData.append('file', chunkFile);
        formData.append('user_id', 'user_123'); 
        formData.append('title', `${customTitle} (Part ${i / batchSize + 1})`); 
        formData.append('operator_name', operator);
        formData.append('passkey', key);

        const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        
        setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Dispatching Batch ${i / batchSize + 1}...` }, ...prev]);

        // 3. Dispatch the chunk and listen to the stream
        const response = await fetch(`${backendUrl}/api/scan`, { method: 'POST', body: formData });
        
        if (response.status === 401) {  
          throw new Error("Authentication Failed: Incorrect Passkey.");
        }
        if (!response.ok) throw new Error(`Backend connection failed on batch ${i / batchSize + 1}`);

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
              fetchHistoricalSessions(); 
            } else if (parsed.type === "result") {
              setLiveResults(prev => [parsed.data, ...prev]);
              completedLocations++;
              
              const globalProgress = Math.floor((completedLocations / totalLocations) * 100);
              setProgress(globalProgress);
              
              setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `Validated ${parsed.data.Location} | ${parsed.data.Product_Name}: ${parsed.data.status}` }, ...prev].slice(0, 50));
            }
          }
        }
        
        if (i + batchSize < totalLocations) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // 4. Global Completion
      setProgress(100); 
      setStatus('completed');
      setLogs(prev => [{ time: new Date().toLocaleTimeString(), msg: `All batches successfully processed. Pipeline closed.` }, ...prev]);
      await fetchHistoricalSessions(); 

    } catch (error) {
      setStatus('idle');
      alert("Pipeline interrupted: " + error.message);
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

  const getStatusTooltip = (val) => {
    if (val.includes('Yes')) return "Available: The item is currently in stock at the assigned dark store for this coordinate.";
    if (val.includes('Out of Stock')) return "Out of Stock: The item is listed in this area but current inventory is 0.";
    if (val.includes('Not in results') || val.includes('Not Found') || val.includes('Empty Results')) return "Not Found: The item does not exist or is completely unmapped in this specific region.";
    if (val.includes('Unserviceable')) return "Unserviceable: These GPS coordinates fall completely outside of Blinkit's operational delivery radius.";
    return "Status code directly from the HTTP response.";
  };

  const renderStatusBadge = (value) => {
    let badge = <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">{value}</span>;
    
    if (value.includes('Yes')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-3 h-3" /> Available</span>;
    } else if (value.includes('Out of Stock')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20"><AlertCircle className="w-3 h-3" /> Out of Stock</span>;
    } else if (value.includes('Not in results') || value.includes('Not Found') || value.includes('Empty Results')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"><X className="w-3 h-3" /> Not Found</span>;
    } else if (value.includes('Unserviceable')) {
      badge = <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"><Ban className="w-3 h-3" /> Unserviceable</span>;
    }

    return (
      <div className="flex items-center gap-2 group/tooltip relative cursor-help w-max">
        {badge}
        <Info className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 group-hover/tooltip:text-zinc-600 dark:group-hover/tooltip:text-zinc-300 transition-colors shrink-0" />
        <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs leading-relaxed text-left rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50">
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
    <div className={`${isDarkMode ? 'dark' : ''} flex w-full h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 font-sans overflow-hidden selection:bg-blue-500/30 selection:text-blue-200 transition-colors duration-300`}>
        {/* Sidebar */}
        <aside className={`flex-shrink-0 transition-all duration-300 ease-in-out border-r border-zinc-200 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-950/50 backdrop-blur-xl relative ${isSidebarOpen ? 'w-80' : 'w-0'}`}>
          <div className={`w-80 h-full flex flex-col transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none hidden'}`}>
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500 dark:text-blue-400" /> Dispatcher
              </h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
            </div>

            <div className="p-4">
              <button onClick={() => handleViewChange('new')} className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'new' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 border border-slate-200 dark:border-zinc-800'}`}>
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
                <div key={session.id} className={`group relative w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${activeView === 'session' && selectedSession?.id === session.id ? 'bg-slate-100 dark:bg-zinc-800/50 border-blue-500/50' : 'bg-white dark:bg-zinc-900/20 border-slate-200 dark:border-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-800/50 hover:border-slate-300 dark:hover:border-zinc-700'}`} onClick={() => handleViewChange('session', session)}>
                  <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-zinc-800/90 backdrop-blur rounded-md border border-slate-200 dark:border-zinc-700 p-0.5 shadow-lg">
                    <button onClick={(e) => { e.stopPropagation(); togglePin(session.id, session.is_pinned); }} className="p-1.5 text-zinc-400 hover:text-slate-800 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-zinc-700"><Pin className={`w-3.5 h-3.5 ${session.is_pinned ? 'fill-blue-500 text-blue-500' : ''}`} /></button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(session.id); setEditTitleValue(session.title); }} className="p-1.5 text-zinc-400 hover:text-slate-800 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-zinc-700"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="p-1.5 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 rounded hover:bg-slate-100 dark:hover:bg-zinc-700"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>

                  <div className="flex flex-col gap-1 pr-8">
                    {editingId === session.id ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={editTitleValue} onChange={e => setEditTitleValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTitleEdit(session.id)} className="bg-white dark:bg-zinc-950 border border-blue-500/50 text-slate-900 dark:text-white text-sm rounded px-2 py-1 w-full outline-none" />
                        <button onClick={() => saveTitleEdit(session.id)} className="p-1 text-emerald-500 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded"><Check className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <span className="font-medium text-sm text-slate-800 dark:text-zinc-200 truncate flex items-center gap-1.5">
                        {session.is_pinned && <Pin className="w-3 h-3 fill-zinc-400 dark:fill-zinc-500 text-zinc-400 dark:text-zinc-500" />} {session.title}
                      </span>
                    )}
                    <p className="text-xs text-zinc-500">{session.date}</p>
                    <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-1">By {session.operator} • {session.total_locations} Locs</span>
                  </div>
                </div>
              ))}
            </div>

            {/* SIGNATURE FOOTER ADDED HERE */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800/80 text-center">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide">
                Made with ❤️ by Jatin Rajani
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 h-full overflow-y-auto relative ${scrollbarHide}`}>
          
          {/* Top Controls (Menu Toggle & Theme Toggle) */}
          <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10 pointer-events-none">
            <div className="pointer-events-auto">
              {!isSidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-lg transition-colors"><Menu className="w-5 h-5" /></button>
              )}
            </div>
            <div className="pointer-events-auto">
              <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-lg transition-colors">
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className={`max-w-5xl mx-auto p-8 lg:p-12 transition-all ${!isSidebarOpen ? 'pl-24' : ''}`}>
            
            {activeView === 'new' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
                
                {/* WAKE UP SYSTEM HEADER IMPLEMENTED HERE */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/60 pb-6">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                      Configure Engine
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      Upload target locations and dispatch the extraction pipeline.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 px-4 py-2 rounded-xl shadow-sm">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
                      Status: 
                      {backendStatus === 'awake' && (
                        <span className="text-emerald-500 dark:text-emerald-400 ml-1.5 flex items-center gap-1 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Awake
                        </span>
                      )}
                      {backendStatus === 'asleep' && (
                        <span className="text-rose-500 dark:text-rose-400 ml-1.5 flex items-center gap-1 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-rose-500" /> Asleep
                        </span>
                      )}
                      {backendStatus === 'unknown' && (
                        <span className="text-zinc-500 ml-1.5 flex items-center gap-1 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600" /> Standby
                        </span>
                      )}
                    </span>

                    <button 
                      type="button"
                      onClick={wakeSystemUp} 
                      disabled={isWaking}
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-200 transition-colors"
                    >
                      {isWaking ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waking...</>
                      ) : (
                        <><Activity className="w-3.5 h-3.5" /> Wake System</>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-white dark:bg-zinc-900/40 backdrop-blur-xl border border-slate-200 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-xl dark:shadow-2xl space-y-6">
                  {!file ? (
                    <div className="space-y-4">
                      <div onClick={() => fileInputRef.current?.click()} className="group cursor-pointer border-2 border-dashed border-slate-300 dark:border-zinc-800 hover:border-blue-500/50 dark:hover:border-blue-500/50 bg-slate-50/50 dark:bg-zinc-950/40 hover:bg-slate-100 dark:hover:bg-zinc-950/80 rounded-2xl p-10 flex flex-col items-center justify-center transition-all">
                        <div className="h-14 w-14 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center group-hover:scale-105 group-hover:border-slate-300 dark:group-hover:border-zinc-700 transition-all">
                          <UploadCloud className="w-6 h-6 text-zinc-400 group-hover:text-blue-500 dark:group-hover:text-blue-400" />
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-slate-800 dark:text-zinc-200">Upload Target Locations</h3>
                        <input ref={fileInputRef} type="file" accept=".xlsx, .csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 rounded-xl p-4 flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400">Required File Format</h4>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 mb-2">Column headers must explicitly match:</p>
                          <div className="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-zinc-300">
                            <span className="bg-white dark:bg-zinc-950 px-2 py-1 rounded border border-slate-200 dark:border-zinc-800">Location</span> +
                            <span className="bg-white dark:bg-zinc-950 px-2 py-1 rounded border border-slate-200 dark:border-zinc-800">Product_Name</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950/80 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4">
                        <div className="flex items-center gap-3.5">
                          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400"><FileSpreadsheet className="w-6 h-6" /></div>
                          <div><h4 className="text-sm font-medium text-slate-800 dark:text-zinc-200 leading-tight">{file.name}</h4></div>
                        </div>
                        {status === 'idle' && <button onClick={() => setFile(null)} className="p-1.5 text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-slate-200 dark:hover:bg-zinc-800 rounded-lg"><X className="w-4 h-4" /></button>}
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
                              <span className={status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400 flex items-center gap-2'}>
                                {status !== 'completed' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                                {status === 'completed' ? 'Execution Finished' : 'Processing on Server...'}
                              </span>
                              <span className="text-zinc-500 dark:text-zinc-400 font-mono">{progress}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-zinc-950 rounded-full overflow-hidden border border-slate-300 dark:border-zinc-800/80">
                              <div className={`h-full transition-all duration-300 ease-out ${status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                          <div className={`bg-slate-50 dark:bg-zinc-950/90 border border-slate-200 dark:border-zinc-800/80 rounded-2xl p-4 font-mono text-xs text-zinc-500 dark:text-zinc-400 h-32 overflow-y-auto space-y-1.5 shadow-inner ${scrollbarHide}`}>
                            {logs.map((log, index) => (
                              <div key={index} className="flex gap-3 leading-relaxed">
                                <span className="text-zinc-400 dark:text-zinc-600 shrink-0">[{log.time}]</span>
                                <span className={index === 0 && status === 'completed' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-zinc-300'}>{log.msg}</span>
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

            {/* TABLE RENDERING (And Session View Header with Wake System if viewed inside a session) */}
            {(liveResults.length > 0 || (activeView === 'session' && selectedSession)) && (
              <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {/* WAKE UP SYSTEM HEADER FOR SESSION VIEW */}
                {activeView === 'session' && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800/60 pb-6 mb-8 mt-8">
                    <div>
                      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
                        {selectedSession?.title}
                      </h1>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Executed on {selectedSession?.date} by {selectedSession?.operator}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 px-4 py-2 rounded-xl shadow-sm">
                      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center">
                        Status: 
                        {backendStatus === 'awake' && (
                          <span className="text-emerald-500 dark:text-emerald-400 ml-1.5 flex items-center gap-1 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Awake
                          </span>
                        )}
                        {backendStatus === 'asleep' && (
                          <span className="text-rose-500 dark:text-rose-400 ml-1.5 flex items-center gap-1 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-rose-500" /> Asleep
                          </span>
                        )}
                        {backendStatus === 'unknown' && (
                          <span className="text-zinc-500 ml-1.5 flex items-center gap-1 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-600" /> Standby
                          </span>
                        )}
                      </span>

                      <button 
                        type="button"
                        onClick={wakeSystemUp} 
                        disabled={isWaking}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 disabled:opacity-50 rounded-lg text-xs font-medium text-slate-700 dark:text-zinc-200 transition-colors"
                      >
                        {isWaking ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waking...</>
                        ) : (
                          <><Activity className="w-3.5 h-3.5" /> Wake System</>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/30 backdrop-blur-xl rounded-3xl overflow-hidden shadow-xl dark:shadow-2xl">
                  <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 bg-slate-50 dark:bg-zinc-950/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                          {activeView === 'session' ? <FileText className="w-5 h-5 text-blue-500 dark:text-blue-400" /> : <Activity className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />}
                          {activeView === 'session' ? "Execution Results" : 'Live Catalog Stream'}
                        </h3>
                      </div>
                      
                      <button onClick={() => exportToExcel(activeView === 'session' ? selectedSession.results : liveResults, activeView === 'session' ? selectedSession.title : 'Live_Run')} className="bg-emerald-50 dark:bg-emerald-600/10 hover:bg-emerald-100 dark:hover:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 transition-colors self-start sm:self-auto">
                        <Download className="w-4 h-4" /> Export Excel/CSV
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <input type="text" placeholder="Search products or locations..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 dark:text-zinc-200 outline-none focus:border-blue-500/50 transition-colors" />
                      </div>
                      <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="appearance-none bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg pl-9 pr-8 py-2 text-sm text-slate-800 dark:text-zinc-200 outline-none focus:border-blue-500/50 transition-colors cursor-pointer">
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
                      <thead className="bg-slate-100 dark:bg-zinc-950/80 text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800/60 uppercase tracking-wider">
                        <tr>
                          <th className="px-6 py-4 font-medium w-16">Id</th>
                          <th className="px-6 py-4 font-medium">Product Name</th>
                          <th className="px-6 py-4 font-medium">Location</th>
                          <th className="px-6 py-4 font-medium">Pincode</th>
                          <th className="px-6 py-4 font-medium">Latitude</th>
                          <th className="px-6 py-4 font-medium">Longitude</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40 text-slate-700 dark:text-zinc-300 font-mono">
                        {displayedResults.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-zinc-800/20 transition-colors">
                            <td className="px-6 py-4 text-slate-400 dark:text-zinc-500 font-mono">{idx + 1}</td>
                            <td className="px-6 py-4 font-sans font-medium text-slate-900 dark:text-zinc-100">{item.Product_Name}</td>
                            <td className="px-6 py-4 text-slate-600 dark:text-zinc-300 truncate max-w-[150px]" title={item.Location}>{item.Location || 'N/A'}</td>
                            <td className="px-6 py-4 text-slate-500 dark:text-zinc-400 font-mono">{item.Pincode || 'N/A'}</td>
                            <td className="px-6 py-4 text-slate-400 dark:text-zinc-500">{item.Latitude ? item.Latitude.toFixed(4) : 'N/A'}</td>
                            <td className="px-6 py-4 text-slate-400 dark:text-zinc-500">{item.Longitude ? item.Longitude.toFixed(4) : 'N/A'}</td>
                            <td className="px-6 py-4">{renderStatusBadge(item.status)}</td>
                          </tr>
                        ))}
                        {displayedResults.length === 0 && (
                          <tr><td colSpan="7" className="text-center py-8 text-slate-400 dark:text-zinc-500 font-sans">No matching records found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* SESSION NAMING MODAL */}
          {showNameModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm px-4">
              <div className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-2">Configure Execution</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mb-5">Name this session and verify your operator identity to begin the extraction.</p>
                
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 block">Session Title</label>
                    <input 
                      type="text" 
                      value={runTitle} 
                      onChange={(e) => setRunTitle(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 outline-none transition-colors"
                      placeholder="e.g., Delhi NCR Q3 Analysis"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 block">Operator Name</label>
                    <select 
                      value={selectedOperator} 
                      onChange={(e) => { setSelectedOperator(e.target.value); setPasskey(""); }}
                      className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 focus:border-blue-500 rounded-xl px-4 py-2.5 text-slate-900 dark:text-zinc-100 outline-none transition-colors appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select your name...</option>
                      {teamMembers.map(member => (
                        <option key={member} value={member}>{member}</option>
                      ))}
                    </select>
                  </div>

                  {selectedOperator && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label className="text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5 block">Operator Passkey</label>
                      <div className="relative">
                        <input 
                          type={showPasskey ? "text" : "password"} 
                          value={passkey} 
                          onChange={(e) => setPasskey(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 focus:border-blue-500 rounded-xl pl-4 pr-11 py-2.5 text-slate-900 dark:text-zinc-100 outline-none transition-colors"
                          placeholder="Enter your operator passkey"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && runTitle.trim() && passkey.trim()) {
                              setShowNameModal(false);
                              startAutomation(runTitle.trim(), selectedOperator, passkey.trim());
                            }
                          }}
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowPasskey(!showPasskey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1"
                        >
                          {showPasskey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-end gap-3">
                  <button 
                    onClick={() => setShowNameModal(false)} 
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={!runTitle.trim() || !selectedOperator || !passkey.trim()}
                    onClick={() => {
                      setShowNameModal(false);
                      startAutomation(runTitle.trim(), selectedOperator, passkey.trim());
                    }} 
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg shadow-blue-900/20 transition-all"
                  >
                    Authenticate & Run
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
  );
}