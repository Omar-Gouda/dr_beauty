function labelFor(announcement) {
  const discount = announcement.discount_type === "percentage"
    ? `${Number(announcement.discount_value)}% off`
    : `EGP ${Number(announcement.discount_value).toFixed(2)} off`;
  const minimum = Number(announcement.minimum_subtotal) > 0
    ? ` on orders over EGP ${Number(announcement.minimum_subtotal).toFixed(2)}`
    : "";
  return `Use code ${announcement.code} for ${discount}${minimum}`;
}

export default function AnnouncementBar({ announcements = [], loading = false }) {
  if (!loading && announcements.length === 0) return null;
  const messages = announcements.map(labelFor);

  return (
    <div className="min-h-9 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-primary-light)] px-4 py-2 text-center text-[11px] font-medium tracking-wide text-[var(--color-text)] sm:text-xs" aria-busy={loading}>
      {loading ? (
        <span className="sr-only">Loading current discount announcements</span>
      ) : (
        <>
          <p className="sr-only" aria-label="Current discount announcements">{messages.join(". ")}</p>
          <div className={`announcement-track${messages.length > 1 ? " is-scrolling" : " justify-center"}`} aria-hidden="true">
            <div className="announcement-sequence">
              {messages.map((message, index) => <span className="announcement-item" key={`${announcements[index].code}-${index}`}>{message}</span>)}
            </div>
            {messages.length > 1 && (
              <div className="announcement-sequence announcement-duplicate">
                {messages.map((message, index) => <span className="announcement-item" key={`duplicate-${announcements[index].code}-${index}`}>{message}</span>)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
