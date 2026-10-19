type MetricCardProps = {
    label: string;
    value: number;
    detail: string;
    tone?: "default" | "warning" | "success";
};

export function MetricCard({
    label,
    value,
    detail,
    tone = "default",
}: MetricCardProps) {
    return (
        <article className={`metric-card metric-${tone}`}>
            <div className="metric-top">
                <span className="metric-label">{label}</span>
                <span className="metric-dot" aria-hidden="true" />
            </div>

            <strong className="metric-value">{value}</strong>
            <p className="metric-detail">{detail}</p>
        </article>
    );
}