import { useEffect, useState } from 'react';
import {
  Cloud,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  FolderPlus,
  Upload,
  Database,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { fetchHealthStatus } from './services/apiClient';
import { deleteFolder, deleteObject } from './services/storageApi';
import { useObjects } from './hooks/useObjects';
import { Breadcrumbs } from './components/common/Breadcrumbs';
import { Sidebar } from './components/common/Sidebar';
import { FileList } from './features/files/FileList';
import { FileSkeleton } from './features/files/FileSkeleton';
import { EmptyFolderState } from './features/files/EmptyFolderState';
import { formatBytes } from './lib/formatters';
import type { HealthResponse } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'files' | 'dashboard' | 'settings'>('files');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const {
    currentPrefix,
    data,
    loading,
    error,
    navigateToFolder,
    navigateUp,
    refetch,
  } = useObjects('');

  const loadHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const healthData = await fetchHealthStatus();
      setHealth(healthData);
    } catch (err: any) {
      setHealthError(err.message || 'Failed to connect to backend server');
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
  }, []);

  const handleDeleteFile = async (key: string) => {
    if (!window.confirm(`Are you sure you want to delete '${key}'?`)) return;
    try {
      await deleteObject(key);
      setActionNotice(`Object '${key}' deleted successfully.`);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to delete object');
    }
  };

  const handleDeleteFolder = async (prefix: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete folder '${prefix}' and all objects inside it?`
      )
    )
      return;
    try {
      const res = await deleteFolder(prefix);
      setActionNotice(`Folder '${prefix}' deleted (${res.deleted_count} items).`);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to delete folder');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
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
            <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800">
              {healthLoading ? (
                <span className="flex items-center gap-2 text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  Connecting API...
                </span>
              ) : healthError ? (
                <span className="flex items-center gap-2 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  API Offline
                </span>
              ) : (
                <span className="flex items-center gap-2 text-emerald-400">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      health?.storage_connected ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  Backend Online ({health?.storage_provider.toUpperCase()}
                  {health?.storage_connected ? '' : ' - S3 Disconnected'})
                </span>
              )}
            </div>

            <button
              onClick={() => {
                loadHealth();
                refetch();
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading || healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          health={health}
          totalObjects={data?.total_count || 0}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 min-w-0">
          {/* Action Notice Alert */}
          {actionNotice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex justify-between items-center">
              <span>{actionNotice}</span>
              <button
                onClick={() => setActionNotice(null)}
                className="text-slate-400 hover:text-white font-bold text-sm ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Top Banner Stats Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                <Database className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Provider
                </p>
                <p className="text-base font-semibold text-white capitalize truncate">
                  {health?.storage_provider || 'Loading...'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
                <HardDrive className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Visible Size
                </p>
                <p className="text-base font-semibold text-white font-mono">
                  {formatBytes(data?.total_size || 0)}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
              <div className="p-3 bg-cyan-500/10 text-cyan-400 rounded-lg border border-cyan-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Items
                </p>
                <p className="text-base font-semibold text-white font-mono">
                  {data?.total_count || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Controls Bar: Breadcrumbs & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              {currentPrefix && (
                <button
                  onClick={navigateUp}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 transition-colors"
                  title="Go up one folder"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <Breadcrumbs currentPrefix={currentPrefix} onNavigate={navigateToFolder} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                disabled
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 text-slate-400 rounded-lg border border-slate-700 text-xs font-medium cursor-not-allowed opacity-60"
              >
                <FolderPlus className="w-4 h-4" />
                New Folder
              </button>
              <button
                disabled
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors cursor-not-allowed opacity-60"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>

          {/* Main File Browser Area */}
          <div className="flex-1 flex flex-col">
            {error ? (
              <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">Unable to list objects</p>
                  <p className="text-xs opacity-80">{error}</p>
                </div>
              </div>
            ) : loading ? (
              <FileSkeleton />
            ) : !data || (data.folders.length === 0 && data.objects.length === 0) ? (
              <EmptyFolderState currentPrefix={currentPrefix} />
            ) : (
              <FileList
                folders={data.folders}
                objects={data.objects}
                onFolderClick={navigateToFolder}
                onDeleteFile={handleDeleteFile}
                onDeleteFolder={handleDeleteFolder}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
