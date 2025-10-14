const SmallStat: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  hint?: React.ReactNode;
}> = ({ icon, label, value, hint }) => {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-card/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col items-start truncate">
          <div className="text-sm font-semibold truncate">{value ?? "—"}</div>
          {hint ? (
            <div className="text-xs text-muted-foreground truncate">{hint}</div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4 min-w-0">
        {icon ? (
          <div className="w-8 h-8 grid place-items-center rounded bg-foreground/5">
            {icon}
          </div>
        ) : null}
        <div className="text-sm text-muted-foreground truncate">{label}</div>
      </div>
    </div>
  );
};

export default SmallStat;
