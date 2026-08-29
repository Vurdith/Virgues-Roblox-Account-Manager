import { AbsoluteFill } from "remotion";
import { Caption, Cursor, ScreenFrame } from "./shared";

export const AccountScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0d0d0e", overflow: "hidden" }}>
      <ScreenFrame
        src="account-desk.png"
        durationInFrames={120}
        startScale={1.04}
        endScale={1.1}
        startTranslate="-30px -8px"
        endTranslate="-70px -30px"
      />
      <Cursor
        frames={[0, 34, 62, 90, 118]}
        xs={[595, 595, 868, 1550, 1550]}
        ys={[430, 430, 210, 625, 625]}
        clickFrames={[34, 90]}
      />
      <Caption durationInFrames={120} width={850}>
        Every account. One desk.
      </Caption>
    </AbsoluteFill>
  );
};
