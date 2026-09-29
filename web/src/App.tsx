import { useEffect, useState } from 'react';
import { Cloud, HardDrive, ShieldCheck, RefreshCw, FolderPlus, Upload, Database } from 'lucide-react';
import { fetchHealthStatus } from './services/apiClient';
import type { HealthResponse } from './types';

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealthStatus();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Header / Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Cloud className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                CloudVault
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  v0.1.0
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicator */}
            <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
              {loading ? (
                <span className="flex items-center gap-2 text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  Connecting API...
                </span>
              ) : error ? (
                <span className="flex items-center gap-2 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  API Offline
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-400">
                  <span className={`w-2 h-2 rounded-full ${health?.storage_connected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  Backend Online ({health?.storage_provider.toUpperCase()}{health?.storage_connected ? '' : ' - S3 Disconnected'})
                </span>
              )}
            </div>

            <button
              onClick={loadHealth}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        {/* System Overview Banner */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Single-User Object Storage Management</h2>
            <p className="text-slate-400 text-sm max-w-2xl">
              CloudVault connects directly to S3-compatible storage providers. Manage files and folders with direct presigned uploads and secure download links.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-400 rounded-lg border border-slate-700 text-sm cursor-not-allowed opacity-60"
            >
              <FolderPlus className="w-4 h-4" />
              New Folder
            </button>
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors cursor-not-allowed opacity-60"
            >
              <Upload className="w-4 h-4" />
              Upload Files
            </button>
          </div>
        </div>

        {/* Dashboard Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Storage Provider</p>
              <p className="text-lg font-semibold text-white capitalize">
                {health?.storage_provider || 'Loading...'}
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Target Bucket</p>
              <p className="text-lg font-semibold text-white font-mono">
                {health?.bucket || 'Loading...'}
              </p>
            </div>
          </div>

          <div className="p-5 rounded-xl bg-slate-800/50 border border-slate-800 flex items-center gap-4">
            <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Architecture</p>
              <p className="text-lg font-semibold text-white">
                Direct S3 Transfer
              </p>
            </div>
          </div>
        </div>

        {/* Dashboard Body Placeholder */}
        <div className="flex-1 rounded-2xl bg-slate-800/30 border border-slate-800/80 p-8 flex flex-col items-center justify-center text-center min-h-80">
          <div className="p-4 bg-slate-800 rounded-full text-slate-500 mb-4 border border-slate-700">
            <HardDrive className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Phase 1 Complete — Skeleton Initialized</h3>
          <p className="text-slate-400 text-sm max-w-md mb-4">
            The FastAPI backend and React frontend are properly configured with CORS and proxy endpoints. Next up is Phase 2 (Storage Connection & Abstraction Layer).
          </p>
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs font-mono max-w-lg">
              Backend Connection Notice: {error}. Ensure FastAPI backend is running via `uv run fastapi dev`.
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        CloudVault — S3-Compatible Object Storage Management System
      </footer>
    </div>
  );
}

export default App;
