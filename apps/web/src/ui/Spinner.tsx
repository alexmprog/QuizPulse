export function Spinner({ label }: { label: string }) {
    return <div className="spinner" role="status" aria-label={label} />;
}
