type StatusBadgeProps = {
    status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
    const normalized = status.toLowerCase();

    const tone =
        normalized === "flagged" ||
            normalized === "high" ||
            normalized === "open"
            ? "danger"
            : normalized === "resolved" ||
                normalized === "clear" ||
                normalized === "legitimate"
                ? "success"
                : "neutral";

    const label = status.replaceAll("_", " ");

    return (
        <span className={`status-badge status-${tone}`}>
            <span className="status-dot" aria-hidden="true" />
            {label}
        </span>
    );
}