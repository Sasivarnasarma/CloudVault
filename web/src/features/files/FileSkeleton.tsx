export function FileSkeleton() {
  return (
    <div className="w-full space-y-3 p-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/40 border border-slate-800 animate-pulse"
        >
          <div className="flex items-center gap-3 w-1/3">
            <div className="w-8 h-8 rounded-lg bg-slate-700/60 shrink-0" />
            <div className="h-4 bg-slate-700/60 rounded w-full" />
          </div>
          <div className="h-4 bg-slate-700/60 rounded w-20 hidden md:block" />
          <div className="h-4 bg-slate-700/60 rounded w-28 hidden sm:block" />
          <div className="w-8 h-8 rounded-lg bg-slate-700/60 shrink-0" />
        </div>
      ))}
    </div>
  );
}
