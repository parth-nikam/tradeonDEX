export function LiveDot({ color = "var(--green)" }: { color?: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        position: "absolute", width: "100%", height: "100%", borderRadius: "50%",
        background: color, opacity: 0.4,
        animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite",
      }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <style>{`@keyframes ping { 75%,100% { transform: scale(2); opacity: 0; } }`}</style>
    </span>
  );
}
