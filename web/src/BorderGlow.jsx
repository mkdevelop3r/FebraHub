export default function BorderGlow({
  children,
  edgeSensitivity = 30,
  glowColor = "40 80 80",
  backgroundColor = "#120F17",
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ["#c084fc", "#f472b6", "#38bdf8"],
}) {
  const mover = (event) => {
    const el = event.currentTarget;
    const r = el.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const distancia = Math.min(x, y, r.width - x, r.height - y);
    const forca = Math.max(0, 1 - distancia / edgeSensitivity) * glowIntensity;
    el.style.setProperty("--glow-x", `${x}px`);
    el.style.setProperty("--glow-y", `${y}px`);
    el.style.setProperty("--glow-opacity", String(forca));
  };

  const sair = (event) => event.currentTarget.style.setProperty("--glow-opacity", "0");
  const paleta = colors.length ? colors.join(", ") : `rgb(${glowColor})`;

  return (
    <div
      className={`borderGlow${animated ? " borderGlowAnimated" : ""}`}
      onPointerMove={mover}
      onPointerLeave={sair}
      style={{
        "--glow-x": "50%",
        "--glow-y": "50%",
        "--glow-opacity": 0,
        "--glow-radius": `${glowRadius}px`,
        "--glow-cone": `${coneSpread}deg`,
        "--glow-solid": `rgb(${glowColor})`,
        "--glow-colors": paleta,
        "--glow-bg": backgroundColor,
        "--glow-border-radius": `${borderRadius}px`,
      }}
    >
      <div className="borderGlowContent">{children}</div>
    </div>
  );
}
