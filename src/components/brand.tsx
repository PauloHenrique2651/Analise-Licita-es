export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="Nexo Público">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M5 24V8h6l10 16h6V8" />
        <path d="M5 8h6l10 16" />
      </svg>
      {!compact && (
        <span className="brand-name">
          NEXO <strong>PÚBLICO</strong>
        </span>
      )}
    </div>
  );
}
