import { AbsoluteFill } from "remotion";
import { Caption, Cursor, ScreenFrame } from "./shared";

export const LaunchScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="account-desk.png"
        durationInFrames={100}
        startScale={1.08}
        endScale={1.18}
        startTranslate="-130px -6px"
        endTranslate="-230px -44px"
      />
      <Cursor
        frames={[0, 30, 68, 98]}
        xs={[1240, 1515, 1515, 1515]}
        ys={[440, 640, 640, 640]}
        clickFrames={[68]}
      />
      <Caption durationInFrames={100} width={880}>
        Pick it. Hit launch. Move on.
      </Caption>
    </AbsoluteFill>
  );
};
