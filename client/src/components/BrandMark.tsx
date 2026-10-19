export function BrandMark() {
    return (
        <div className="brand">
            <span className="brand-icon" aria-hidden="true">
                <svg viewBox="0 0 32 32" fill="none">
                    <path
                        d="M16 3 27 7v8c0 7-4.5 11.4-11 14C9.5 26.4 5 22 5 15V7L16 3Z"
                        stroke="currentColor"
                        strokeWidth="2"
                    />
                    <path
                        d="m11 16 3.4 3.4L21 12.8"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </span>
            <span>
                Fraud<span className="brand-accent">Shield</span>
            </span>
        </div>
    );
}