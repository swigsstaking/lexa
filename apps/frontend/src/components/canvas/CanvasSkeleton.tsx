const SKELETON_NODES = [
  { left: '18%', top: '28%' },
  { left: '18%', top: '60%' },
  { left: '40%', top: '22%' },
  { left: '40%', top: '66%' },
  { left: '68%', top: '30%' },
  { left: '68%', top: '62%' },
];

export function CanvasSkeleton() {
  return (
    <div className="h-full w-full relative bg-bg overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(rgb(var(--border)) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      {SKELETON_NODES.map((pos, i) => (
        <div
          key={i}
          className="absolute w-[140px] h-[72px] rounded-xl bg-surface border border-border animate-pulse"
          style={{
            left: pos.left,
            top: pos.top,
            transform: 'translate(-50%, -50%)',
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}
