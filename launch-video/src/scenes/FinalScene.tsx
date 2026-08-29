import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

export const FinalScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18, 108, 126], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const translateY = interpolate(frame, [0, 20], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0d0d0e",
        color: "#fffaf1",
        opacity,
        textAlign: "center",
      }}
    >
      <div style={{ transform: `translateY(${translateY}px)` }}>
        <Img src={staticFile("virgue-icon.png")} style={{ width: 112, height: 112, objectFit: "contain" }} />
        <div style={{ marginTop: 22, fontSize: 92, lineHeight: 1, fontWeight: 700, letterSpacing: "-0.065em" }}>
          Virgue.
        </div>
        <div style={{ marginTop: 28, color: "#f4eade", fontSize: 38, lineHeight: 1.1, fontWeight: 500 }}>
          Stop managing the setup. Start playing.
        </div>
      </div>
    </AbsoluteFill>
  );
};
