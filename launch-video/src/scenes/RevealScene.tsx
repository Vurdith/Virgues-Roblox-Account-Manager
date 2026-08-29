import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { ScreenFrame, VirgueLogo } from "./shared";

export const RevealScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="account-desk.png"
        durationInFrames={84}
        startScale={1.04}
        endScale={1.06}
        startTranslate="-8px -10px"
        endTranslate="-18px -18px"
        dim={0.7}
      />
      <Interactive.Div
        name="Founder reveal"
        style={{
          position: "absolute",
          left: 150,
          bottom: 132,
          display: "flex",
          alignItems: "center",
          gap: 28,
          color: "#fffdf8",
          opacity: interpolate(frame, [0, 12, 70, 84], [0, 1, 1, 0], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 14], ["0px 18px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <VirgueLogo size={92} />
        <div
          style={{
            fontSize: 82,
            fontWeight: 700,
            letterSpacing: "-0.055em",
            lineHeight: 0.95,
          }}
        >
          So I built Virgue.
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
