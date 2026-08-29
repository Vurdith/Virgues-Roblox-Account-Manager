import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { CSSProperties, ReactNode } from "react";

const C = {
  ink: "#111213",
  inkSoft: "#252729",
  paper: "#f4f0e7",
  white: "#fffdf7",
  coral: "#ff6d63",
  coralDark: "#e85c55",
  yellow: "#e8c25d",
  mint: "#a6d5b4",
};

const TYPE = '"Outfit", Arial, sans-serif';
const CLAMP = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
const SOFT = Easing.bezier(0.16, 1, 0.3, 1);
const LINEAR = Easing.linear;

const springIn = (frame: number, delay: number, fps: number, stiffness = 170) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, mass: 0.62, stiffness },
  });

const reveal = (frame: number, start: number, end: number, easing = SOFT) =>
  interpolate(frame, [start, end], [0, 1], { ...CLAMP, easing });

const sceneOpacity = (frame: number, duration: number, entrance = 10, exit = 8) =>
  interpolate(
    frame,
    [0, entrance, Math.max(entrance + 1, duration - exit), duration],
    [0, 1, 1, 0],
    { ...CLAMP, easing: SOFT },
  );

function Grid({ dark = true, opacity = 0.58 }: { readonly dark?: boolean; readonly opacity?: number }) {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 720], [0, -48], { ...CLAMP, easing: LINEAR });
  const line = dark ? "rgba(255,253,247,0.065)" : "rgba(17,18,19,0.09)";
  return (
    <div
      style={{
        position: "absolute",
        inset: -90,
        opacity,
        transform: `translate(${drift}px, ${drift * 0.22}px) rotate(-1.2deg)`,
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: "84px 84px",
        pointerEvents: "none",
      }}
    />
  );
}

function Grain({ dark = true }: { readonly dark?: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.16,
        mixBlendMode: dark ? "screen" : "multiply",
        backgroundImage: dark
          ? "radial-gradient(rgba(255,253,247,0.17) 0.65px, transparent 0.8px)"
          : "radial-gradient(rgba(17,18,19,0.13) 0.65px, transparent 0.8px)",
        backgroundSize: "5px 5px",
        pointerEvents: "none",
        zIndex: 40,
      }}
    />
  );
}

function Rule({ frame, start = 0, color = C.coral, width = 560, x = 100, y = 100, height = 5 }: { readonly frame: number; readonly start?: number; readonly color?: string; readonly width?: number; readonly x?: number; readonly y?: number; readonly height?: number }) {
  const p = reveal(frame, start, start + 22);
  return <div style={{ position: "absolute", left: x, top: y, width: width * p, height, backgroundColor: color, transformOrigin: "left center", zIndex: 12 }} />;
}

function KineticCopy({
  children,
  x,
  y,
  frame,
  start = 0,
  size = 120,
  color = C.white,
  maxWidth = 900,
  align = "left",
  weight = 700,
  end,
}: {
  readonly children: ReactNode;
  readonly x: number;
  readonly y: number;
  readonly frame: number;
  readonly start?: number;
  readonly size?: number;
  readonly color?: string;
  readonly maxWidth?: number;
  readonly align?: "left" | "center";
  readonly weight?: number;
  readonly end?: number;
}) {
  const { fps } = useVideoConfig();
  const p = springIn(frame, start, fps, 180);
  const xOffset = interpolate(p, [0, 1], [-94, 0]);
  const endOpacity = end === undefined ? 1 : interpolate(frame, [end - 12, end], [1, 0], CLAMP);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        maxWidth,
        color,
        opacity: p * endOpacity,
        transform: `translate3d(${xOffset}px, 0, 0) scaleX(${interpolate(p, [0, 1], [0.94, 1])})`,
        transformOrigin: "left center",
        fontFamily: TYPE,
        fontSize: size,
        lineHeight: 0.84,
        fontWeight: weight,
        letterSpacing: "-0.07em",
        textAlign: align,
        zIndex: 18,
      }}
    >
      {children}
    </div>
  );
}

function CornerFrame({ x, y, width, height, color, opacity = 1, thickness = 4 }: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly color: string; readonly opacity?: number; readonly thickness?: number }) {
  const length = Math.min(50, Math.round(width * 0.14));
  const stroke: CSSProperties = { position: "absolute", backgroundColor: color, opacity };
  return (
    <div style={{ position: "absolute", left: x, top: y, width, height, pointerEvents: "none", zIndex: 18 }}>
      <span style={{ ...stroke, left: 0, top: 0, width: length, height: thickness }} />
      <span style={{ ...stroke, left: 0, top: 0, width: thickness, height: length }} />
      <span style={{ ...stroke, right: 0, top: 0, width: length, height: thickness }} />
      <span style={{ ...stroke, right: 0, top: 0, width: thickness, height: length }} />
      <span style={{ ...stroke, left: 0, bottom: 0, width: length, height: thickness }} />
      <span style={{ ...stroke, left: 0, bottom: 0, width: thickness, height: length }} />
      <span style={{ ...stroke, right: 0, bottom: 0, width: length, height: thickness }} />
      <span style={{ ...stroke, right: 0, bottom: 0, width: thickness, height: length }} />
    </div>
  );
}

function ProductFrame({
  src,
  x,
  y,
  width,
  height,
  frame,
  start = 0,
  fromX = 120,
  fromY = 0,
  rotate = 0,
  dark = false,
  imageScale = 1,
  imageOffsetX = 0,
  imageOffsetY = 0,
  objectPosition = "center",
  shadow = true,
  zIndex = 5,
  end,
}: {
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly frame: number;
  readonly start?: number;
  readonly fromX?: number;
  readonly fromY?: number;
  readonly rotate?: number;
  readonly dark?: boolean;
  readonly imageScale?: number;
  readonly imageOffsetX?: number;
  readonly imageOffsetY?: number;
  readonly objectPosition?: string;
  readonly shadow?: boolean;
  readonly zIndex?: number;
  readonly end?: number;
}) {
  const { fps } = useVideoConfig();
  const p = springIn(frame, start, fps, 155);
  const left = interpolate(p, [0, 1], [x + fromX, x]);
  const top = interpolate(p, [0, 1], [y + fromY, y]);
  const rotation = interpolate(p, [0, 1], [rotate + (fromX >= 0 ? 4 : -4), rotate]);
  const revealP = reveal(frame, start + 2, start + 20);
  const scale = interpolate(p, [0, 1], [0.93, 1]);
  const endOpacity = end === undefined ? 1 : interpolate(frame, [end - 12, end], [1, 0], CLAMP);
  const frameColor = dark ? C.white : C.ink;
  const background = dark ? C.inkSoft : C.white;
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        opacity: p * endOpacity,
        transform: `translate3d(0, 0, 0) rotate(${rotation}deg) scale(${scale})`,
        transformOrigin: "center center",
        backgroundColor: background,
        border: `5px solid ${frameColor}`,
        boxShadow: shadow ? `18px 18px 0 ${dark ? "rgba(255,253,247,0.17)" : "rgba(17,18,19,0.24)"}` : "none",
        overflow: "hidden",
        zIndex,
      }}
    >
      <div style={{ position: "absolute", inset: 10, overflow: "hidden", clipPath: `inset(0 ${100 - revealP * 100}% 0 0)` }}>
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
            objectPosition,
            transform: `translate3d(${imageOffsetX}px, ${imageOffsetY}px, 0) scale(${imageScale})`,
            transformOrigin: "center center",
            filter: dark ? "contrast(1.11) saturate(0.8) brightness(0.78)" : "contrast(1.04) saturate(0.9)",
          }}
        />
      </div>
    </div>
  );
}

function Pointer({ x, y, frame, start, color = C.ink }: { readonly x: number; readonly y: number; readonly frame: number; readonly start: number; readonly color?: string }) {
  const p = springIn(frame, start, 30, 220);
  const press = interpolate(frame, [start + 38, start + 44, start + 51], [1, 0.78, 1], { ...CLAMP, easing: SOFT });
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: p, transform: `translate3d(0, 0, 0) rotate(-15deg) scale(${press})`, transformOrigin: "12px 12px", filter: `drop-shadow(6px 7px 0 rgba(17,18,19,0.46))`, zIndex: 35 }}>
      <svg viewBox="0 0 52 66" width="52" height="66">
        <path d="M6 4 10 51l13-10 8 20 8-4-9-20 17-2L6 4Z" fill={color === C.ink ? C.white : C.ink} stroke={color} strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ClickRipple({ x, y, frame, start, color = C.coral }: { readonly x: number; readonly y: number; readonly frame: number; readonly start: number; readonly color?: string }) {
  const p = reveal(frame, start, start + 28);
  const opacity = interpolate(frame, [start, start + 6, start + 28], [0, 0.9, 0], CLAMP);
  return (
    <>
      {[1, 1.65, 2.3].map((ring) => (
        <div key={ring} style={{ position: "absolute", left: x - 28 * ring * p, top: y - 28 * ring * p, width: 56 * ring * p, height: 56 * ring * p, border: `5px solid ${color}`, borderRadius: "50%", opacity: opacity * (1.05 - ring * 0.23), zIndex: 32 }} />
      ))}
      <div style={{ position: "absolute", left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: "50%", backgroundColor: color, opacity: opacity, zIndex: 33 }} />
    </>
  );
}

function BrandLockup({ frame, start = 0, x = 96, y = 82, light = false }: { readonly frame: number; readonly start?: number; readonly x?: number; readonly y?: number; readonly light?: boolean }) {
  const p = springIn(frame, start, 30, 150);
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex", alignItems: "center", gap: 16, opacity: p, transform: `translate3d(${interpolate(p, [0, 1], [-30, 0])}px, 0, 0)`, color: light ? C.white : C.ink, zIndex: 28 }}>
      <Img src={staticFile("virgue-icon.png")} style={{ width: 58, height: 58, objectFit: "contain", display: "block" }} />
      <div style={{ fontFamily: TYPE, fontWeight: 700, fontSize: 28, lineHeight: 0.86, letterSpacing: "-0.065em" }}>
        Virgue
        <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", opacity: 0.62 }}>ROBLOX ACCOUNT MANAGER</div>
      </div>
    </div>
  );
}

export const HookRecutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 136, 7, 8);
  const slash = reveal(frame, 0, 26);
  const pulse = interpolate(frame, [14, 32, 136], [1, 1.018, 1.035], { ...CLAMP, easing: SOFT });
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, opacity, overflow: "hidden", fontFamily: TYPE }}>
      <Grid />
      <Grain />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 14, backgroundColor: C.coral, transform: `scaleX(${slash})`, transformOrigin: "left" }} />
      <div style={{ position: "absolute", left: 1170, top: -380, width: 980, height: 1520, backgroundColor: C.coral, opacity: 0.09, transform: `rotate(17deg) scale(${pulse})`, transformOrigin: "center" }} />
      <ProductFrame src="account-desk.png" x={1110} y={262} width={580} height={470} frame={frame} start={10} end={68} fromX={150} fromY={46} rotate={2.6} dark imageScale={3.45} imageOffsetX={540} imageOffsetY={190} zIndex={7} />
      <ProductFrame src="account-desk.png" x={842} y={154} width={1020} height={730} frame={frame} start={55} fromX={176} fromY={42} rotate={-3.3} dark imageScale={1.04} imageOffsetX={-25} zIndex={5} />
      <KineticCopy x={98} y={180} frame={frame} start={2} end={70} size={132} maxWidth={770}>
        ONE ROBLOX
        <br />
        ACCOUNT IS
        <br />
        <span style={{ color: C.coral }}>EASY.</span>
      </KineticCopy>
      <KineticCopy x={98} y={224} frame={frame} start={58} size={150} maxWidth={760}>
        MULTIPLE
        <br />
        <span style={{ color: C.coral }}>SHOULD BE TOO.</span>
      </KineticCopy>
      <Rule frame={frame} start={77} color={C.coral} width={468} x={104} y={704} height={6} />
    </AbsoluteFill>
  );
};

export const OrganizeRecutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 152, 8, 8);
  const path = reveal(frame, 22, 104);
  const line = reveal(frame, 28, 76);
  return (
    <AbsoluteFill style={{ backgroundColor: C.paper, opacity, overflow: "hidden", fontFamily: TYPE }}>
      <Grid dark={false} opacity={0.65} />
      <Grain dark={false} />
      <BrandLockup frame={frame} start={5} />
      <KineticCopy x={96} y={198} frame={frame} start={8} size={108} color={C.ink} maxWidth={850}>
        Keep it <span style={{ color: C.coralDark }}>together.</span>
      </KineticCopy>
      <div style={{ position: "absolute", left: 102, top: 344, width: 440, color: C.inkSoft, opacity: reveal(frame, 24, 42), fontSize: 31, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.055em", zIndex: 18 }}>Your accounts, games, and sessions — in the same place.</div>
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 4 }}>
        <path d="M 426 750 C 612 750, 642 700, 752 700 S 964 700, 1068 700 S 1288 750, 1502 750" fill="none" stroke={C.ink} strokeWidth="7" strokeDasharray="1200" strokeDashoffset={1200 - path * 1200} opacity={0.78} />
        {[426, 960, 1502].map((x, index) => <circle key={x} cx={x} cy={index === 1 ? 700 : 750} r="14" fill={[C.coral, C.yellow, C.mint][index]} stroke={C.ink} strokeWidth="5" opacity={line} />)}
      </svg>
      <ProductFrame src="account-desk.png" x={96} y={516} width={520} height={360} frame={frame} start={18} fromX={-120} fromY={42} rotate={-2.3} imageScale={1.04} zIndex={7} />
      <ProductFrame src="game-shelf.png" x={704} y={470} width={520} height={360} frame={frame} start={31} fromX={80} fromY={72} rotate={1.4} imageScale={1.05} zIndex={7} />
      <ProductFrame src="session-board.png" x={1310} y={516} width={520} height={360} frame={frame} start={44} fromX={120} fromY={38} rotate={-1.6} imageScale={1.06} zIndex={7} />
    </AbsoluteFill>
  );
};

export const ChooseRecutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 160, 8, 8);
  const { fps } = useVideoConfig();
  const p = springIn(frame, 5, fps, 155);
  const camera = interpolate(frame, [12, 118, 160], [1.01, 1.09, 1.12], { ...CLAMP, easing: SOFT });
  const highlight = interpolate(frame, [36, 52, 98, 116], [0, 1, 1, 0], { ...CLAMP, easing: SOFT });
  const pointerX = interpolate(frame, [32, 82, 124], [260, 520, 1022], { ...CLAMP, easing: SOFT });
  const pointerY = interpolate(frame, [32, 82, 124], [690, 620, 768], { ...CLAMP, easing: SOFT });
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, opacity, overflow: "hidden", fontFamily: TYPE }}>
      <Grid />
      <Grain />
      <KineticCopy x={98} y={100} frame={frame} start={4} size={112} maxWidth={940}>
        Pick the <span style={{ color: C.coral }}>right setup.</span>
      </KineticCopy>
      <ProductFrame src="account-desk.png" x={96} y={334} width={1226} height={650} frame={frame} start={12} fromX={-140} fromY={52} rotate={-1.4} dark imageScale={camera} imageOffsetX={interpolate(frame, [0, 160], [0, -22], { ...CLAMP, easing: LINEAR })} imageOffsetY={-12} zIndex={6} />
      <ProductFrame src="game-shelf.png" x={1345} y={398} width={480} height={450} frame={frame} start={28} fromX={160} fromY={35} rotate={2.2} dark imageScale={1.08} objectPosition="right center" zIndex={10} />
      <CornerFrame x={1007} y={714} width={228} height={112} color={C.coral} opacity={highlight} />
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
        <path d="M 1016 770 C 1190 770, 1268 650, 1396 610" fill="none" stroke={C.coral} strokeWidth="7" strokeDasharray="520" strokeDashoffset={520 - reveal(frame, 52, 114) * 520} />
        <circle cx="1016" cy="770" r="13" fill={C.coral} />
        <circle cx="1396" cy="610" r="13" fill={C.coral} />
      </svg>
      <Pointer x={pointerX} y={pointerY} frame={frame} start={30} color={C.ink} />
      <ClickRipple x={1040} y={773} frame={frame} start={103} />
      <div style={{ position: "absolute", left: 100, bottom: 74, color: C.white, opacity: p * 0.7, fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em", zIndex: 18 }}>No tab hunt. No memory test.</div>
    </AbsoluteFill>
  );
};

export const LaunchRecutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 76, 8, 8);
  const { fps } = useVideoConfig();
  const titleP = springIn(frame, 29, fps, 180);
  const flash = interpolate(frame, [49, 54, 68], [0, 1, 0], { ...CLAMP, easing: SOFT });
  const camera = interpolate(frame, [0, 42, 76], [1.02, 1.06, 1.1], { ...CLAMP, easing: SOFT });
  return (
    <AbsoluteFill style={{ backgroundColor: C.coral, opacity, overflow: "hidden", fontFamily: TYPE }}>
      <Grid dark={false} opacity={0.42} />
      <Grain dark={false} />
      <div style={{ position: "absolute", left: -380, top: -360, width: 1180, height: 1180, border: "3px solid rgba(17,18,19,0.18)", borderRadius: "50%", boxShadow: "0 0 0 90px rgba(17,18,19,0.035), 0 0 0 180px rgba(17,18,19,0.025)" }} />
      <KineticCopy x={96} y={194} frame={frame} start={29} size={164} color={C.ink} maxWidth={760}>
        Then<br /><span style={{ color: C.white }}>launch.</span>
      </KineticCopy>
      <div style={{ position: "absolute", left: 106, top: 602, color: C.ink, opacity: titleP * 0.72, fontSize: 32, lineHeight: 1.02, fontWeight: 500, letterSpacing: "-0.055em", zIndex: 18 }}>One click to get on with it.</div>
      <ProductFrame src="account-desk.png" x={840} y={142} width={990} height={760} frame={frame} start={8} fromX={170} fromY={38} rotate={2.2} imageScale={camera} imageOffsetX={-50} shadow zIndex={6} />
      <div style={{ position: "absolute", left: 1640, top: 630, width: 186, height: 58, border: `5px solid ${C.coral}`, opacity: flash, backgroundColor: "rgba(255,253,247,0.28)", boxShadow: `0 0 0 14px rgba(255,253,247,${flash * 0.12})`, zIndex: 22 }} />
      <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 21 }}>
        <path d="M 724 648 C 930 648, 1080 790, 1370 760 S 1570 670, 1734 659" fill="none" stroke={C.ink} strokeWidth="7" strokeDasharray="1120" strokeDashoffset={1120 - reveal(frame, 20, 52) * 1120} opacity={0.88} />
        <circle cx="724" cy="648" r="13" fill={C.ink} />
        <circle cx="1734" cy="659" r="13" fill={C.ink} />
      </svg>
      <Pointer x={1632} y={588} frame={frame} start={37} />
      <ClickRipple x={1734} y={659} frame={frame} start={52} color={C.ink} />
    </AbsoluteFill>
  );
};

export const PayoffRecutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 228, 12, 1);
  const { fps } = useVideoConfig();
  const p = springIn(frame, 8, fps, 150);
  const stripe = reveal(frame, 0, 34);
  const lower = reveal(frame, 40, 70);
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, opacity, overflow: "hidden", fontFamily: TYPE, alignItems: "center", justifyContent: "center" }}>
      <Grid />
      <Grain />
      <div style={{ position: "absolute", left: 100, top: 120, width: 1720 * stripe, height: 7, backgroundColor: C.coral, transformOrigin: "left center" }} />
      <div style={{ position: "absolute", right: -280, bottom: -390, width: 940, height: 940, border: "3px solid rgba(255,253,247,0.14)", borderRadius: "50%", transform: `scale(${0.84 + p * 0.16})`, opacity: p }} />
      <div style={{ position: "relative", width: 1280, textAlign: "center", opacity: p, transform: `translate3d(0, ${interpolate(p, [0, 1], [38, 0])}px, 0)`, zIndex: 10 }}>
        <Img src={staticFile("virgue-icon.png")} style={{ width: 104, height: 104, objectFit: "contain", display: "block", margin: "0 auto", transform: `scale(${interpolate(p, [0, 1], [0.68, 1])})` }} />
        <div style={{ marginTop: 22, color: C.white, fontSize: 148, lineHeight: 0.84, fontWeight: 700, letterSpacing: "-0.105em" }}>Virgue.</div>
        <div style={{ marginTop: 38, color: C.white, fontSize: 58, lineHeight: 0.92, fontWeight: 600, letterSpacing: "-0.075em" }}>More game.<br /><span style={{ color: C.coral }}>Less juggling.</span></div>
        <div style={{ marginTop: 34, color: C.white, opacity: lower * 0.7, fontSize: 22, fontWeight: 500, letterSpacing: "0.01em" }}>Your setup, ready when you are.</div>
      </div>
    </AbsoluteFill>
  );
};
