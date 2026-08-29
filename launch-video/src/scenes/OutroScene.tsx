import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { VirgueLogo } from "./shared";

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0d0d0e",
        color: "#fffdf8",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Interactive.Div
        name="Final lockup"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: interpolate(frame, [0, 10, 68, 80], [0, 1, 1, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [0, 18], [0.92, 1], {
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <VirgueLogo size={128} />
        <div
          style={{
            marginTop: 20,
            fontSize: 92,
            fontWeight: 700,
            letterSpacing: "-0.06em",
            lineHeight: 1,
          }}
        >
          Virgue.
        </div>
        <div
          style={{
            marginTop: 16,
            color: "#c9c6bd",
            fontSize: 44,
            fontWeight: 500,
            letterSpacing: "-0.025em",
          }}
        >
          Everything in its place.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
