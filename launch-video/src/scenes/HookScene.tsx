import { AbsoluteFill } from "remotion";
import { Caption, Cursor, ScreenFrame } from "./shared";

export const HookScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="account-desk.png"
        durationInFrames={120}
        startScale={1.03}
        endScale={1.085}
        startTranslate="0px 8px"
        endTranslate="-18px -16px"
        dim={0.18}
      />
      <Cursor
        frames={[0, 22, 42, 68, 88, 116]}
        xs={[565, 565, 895, 895, 1230, 1230]}
        ys={[430, 430, 430, 430, 430, 430]}
        clickFrames={[22, 68, 108]}
      />
      <Caption durationInFrames={120} width={1120} large note="Five accounts open.">
        Which one is actually running?
      </Caption>
    </AbsoluteFill>
  );
};
