import {Video} from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {ReactNode} from "react";

const C = {ink: "#101112", paper: "#f6f1e8", white: "#fffdf8", coral: "#ff6b62", yellow: "#edc65d"};
const FONT = '"Outfit", Arial, sans-serif';
const CLAMP = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const INOUT = Easing.bezier(0.76, 0, 0.24, 1);
const t = (frame: number, a: number, b: number, easing = OUT) => interpolate(frame, [a, b], [0, 1], {...CLAMP, easing});

function Texture({dark = false}: {readonly dark?: boolean}) {
  const frame = useCurrentFrame();
  const color = dark ? "rgba(255,253,248,.06)" : "rgba(16,17,18,.055)";
  return <>
    <div style={{position: "absolute", inset: -100, opacity: .72, translate: `${interpolate(frame, [0, 720], [0, -70], CLAMP)}px 0`, backgroundImage: `linear-gradient(${color} 1px, transparent 1px),linear-gradient(90deg,${color} 1px,transparent 1px)`, backgroundSize: "96px 96px"}} />
    <div style={{position: "absolute", inset: 0, opacity: dark ? .11 : .08, backgroundImage: `radial-gradient(${dark ? "rgba(255,253,248,.55)" : "rgba(16,17,18,.42)"} .55px, transparent .8px)`, backgroundSize: "5px 5px"}} />
  </>;
}

function Screen({
  src, x, y, width, height, rotate = 0, scale = 1, opacity = 1, cropScale = 1, cropX = 0, cropY = 0, children,
}: {
  readonly src: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly rotate?: number; readonly scale?: number; readonly opacity?: number; readonly cropScale?: number; readonly cropX?: number; readonly cropY?: number; readonly children?: ReactNode;
}) {
  return <div style={{position: "absolute", left: x, top: y, width, height, overflow: "hidden", borderRadius: 34, border: `4px solid ${C.ink}`, background: C.paper, boxShadow: "18px 24px 0 rgba(16,17,18,.12), 0 36px 90px rgba(16,17,18,.22)", rotate: `${rotate}deg`, scale, opacity, transformOrigin: "center", zIndex: 10}}>
    <Img src={staticFile(src)} style={{width: "100%", height: "100%", objectFit: "cover", display: "block", scale: cropScale, translate: `${cropX}px ${cropY}px`, transformOrigin: "center", filter: "contrast(1.035) saturate(.92)"}} />
    {children}
  </div>;
}

function Headline({frame, start, end, children, x = 94, y = 174, size = 172, color = C.ink}: {readonly frame: number; readonly start: number; readonly end: number; readonly children: ReactNode; readonly x?: number; readonly y?: number; readonly size?: number; readonly color?: string}) {
  const {fps} = useVideoConfig();
  const intro = spring({frame: frame - start, fps, config: {damping: 20, stiffness: 175}});
  const outro = interpolate(frame, [end - 12, end], [1, 0], CLAMP);
  return <div style={{position: "absolute", left: x, top: y, color, fontFamily: FONT, fontSize: size, lineHeight: .84, fontWeight: 700, letterSpacing: "-.065em", opacity: intro * outro, translate: `0 ${interpolate(intro, [0, 1], [100, 0])}px`, zIndex: 28}}>{children}</div>;
}

function VoiceBeat({frame, start, end, children, x = 94, y = 74, size = 86, color = C.ink, fadeOutFrames = 8}: {readonly frame: number; readonly start: number; readonly end: number; readonly children: ReactNode; readonly x?: number; readonly y?: number; readonly size?: number; readonly color?: string; readonly fadeOutFrames?: number}) {
  const {fps} = useVideoConfig();
  const intro = spring({frame: frame - start, fps, config: {damping: 22, stiffness: 205}});
  const outro = fadeOutFrames === 0 ? (frame < end ? 1 : 0) : interpolate(frame, [end - fadeOutFrames, end], [1, 0], CLAMP);
  return <div style={{position: "absolute", left: x, top: y, color, fontFamily: FONT, fontSize: size, lineHeight: .88, fontWeight: 700, letterSpacing: "-.055em", opacity: intro * outro, translate: `0 ${interpolate(intro, [0, 1], [45, 0])}px`, zIndex: 34}}>{children}</div>;
}

function Cursor({frame, start, click, x, y}: {readonly frame: number; readonly start: number; readonly click: number; readonly x: number; readonly y: number}) {
  const arrival = t(frame, start, start + 18);
  const presence = interpolate(frame, [start, start + 14, click + 18, click + 34], [0, 1, 1, 0], CLAMP);
  const press = interpolate(frame, [click - 3, click, click + 5], [1, .72, 1], CLAMP);
  const ripple = t(frame, click, click + 18);
  return <>
    <div style={{position: "absolute", left: x - 38 * ripple, top: y - 38 * ripple, width: 76 * ripple, height: 76 * ripple, borderRadius: "50%", border: `3px solid ${C.coral}`, opacity: interpolate(ripple, [0, .2, 1], [0, .8, 0], CLAMP), zIndex: 35}} />
    <div style={{position: "absolute", left: interpolate(arrival, [0, 1], [x - 160, x]), top: interpolate(arrival, [0, 1], [y + 110, y]), scale: press, opacity: arrival * presence, rotate: "-13deg", filter: "drop-shadow(5px 7px 0 rgba(16,17,18,.26))", zIndex: 36}}>
      <svg width="48" height="62" viewBox="0 0 48 62"><path d="M5 4 9 48l13-10 9 20 8-4-9-20 15-2L5 4Z" fill={C.white} stroke={C.ink} strokeWidth="4" strokeLinejoin="round" /></svg>
    </div>
  </>;
}

function Hook({frame}: {readonly frame: number}) {
  const zoom = t(frame, 58, 124, INOUT);
  const wipe = t(frame, 120, 148, INOUT);
  const opacity = interpolate(frame, [0, 142, 158], [1, 1, 0], CLAMP);
  return <AbsoluteFill style={{background: C.paper, overflow: "hidden", opacity}}>
    <Texture />
    <div style={{position: "absolute", left: 96, top: 88, width: 194, height: 8, background: C.coral, scale: `${t(frame, 0, 18)} 1`, transformOrigin: "left", zIndex: 30}} />
    <Headline frame={frame} start={4} end={61} y={156} size={132}>One Roblox<br />account is <span style={{color: C.coral}}>easy.</span></Headline>
    <Headline frame={frame} start={64} end={124} y={156} size={142}>Multiple should<br />be <span style={{color: C.coral}}>too.</span></Headline>
    <Screen src="account-desk.png" x={interpolate(zoom, [0, 1], [1050, 610])} y={interpolate(zoom, [0, 1], [218, 92])} width={interpolate(zoom, [0, 1], [626, 1215])} height={interpolate(zoom, [0, 1], [590, 888])} rotate={interpolate(zoom, [0, 1], [2.4, -.6])} scale={interpolate(frame, [0, 22], [.88, 1], CLAMP)} cropScale={interpolate(zoom, [0, 1], [3.55, 1.02])} cropX={interpolate(zoom, [0, 1], [740, -6])} cropY={interpolate(zoom, [0, 1], [276, 0])} />
    <div style={{position: "absolute", left: interpolate(wipe, [0, 1], [1750, -150]), top: interpolate(wipe, [0, 1], [390, -160]), width: interpolate(wipe, [0, 1], [120, 2300]), height: interpolate(wipe, [0, 1], [270, 1420]), borderRadius: interpolate(wipe, [0, 1], [90, 0]), background: C.coral, rotate: "-7deg", zIndex: 60}} />
  </AbsoluteFill>;
}

function Tour({frame}: {readonly frame: number}) {
  const a = interpolate(frame, [136, 160, 298, 312], [0, 1, 1, 0], CLAMP);
  const enter = t(frame, 142, 170);
  return <AbsoluteFill style={{background: C.ink, opacity: a, overflow: "hidden"}}>
    <Texture dark />
    <div style={{position: "absolute", left: 96, top: 70, width: 1728, height: 8, background: C.coral, scale: `${enter} 1`, transformOrigin: "left", zIndex: 20}} />
    <VoiceBeat frame={frame} start={141} end={178} y={858} size={76} color={C.white} fadeOutFrames={0}>Every <span style={{color: C.coral}}>profile.</span></VoiceBeat>
    <VoiceBeat frame={frame} start={178} end={216} y={858} size={76} color={C.white} fadeOutFrames={0}>Every <span style={{color: C.coral}}>game.</span></VoiceBeat>
    <VoiceBeat frame={frame} start={216} end={254} y={858} size={76} color={C.white} fadeOutFrames={0}>Live <span style={{color: C.coral}}>session.</span></VoiceBeat>
    <VoiceBeat frame={frame} start={254} end={302} y={858} size={76} color={C.white} fadeOutFrames={0}>One control <span style={{color: C.coral}}>desk.</span></VoiceBeat>
    <div style={{position: "absolute", left: 90, top: 162, width: 1740, height: 646, overflow: "hidden", borderRadius: 42, border: `3px solid ${C.white}`, background: C.paper, boxShadow: "0 40px 110px rgba(0,0,0,.52)", scale: interpolate(enter, [0, 1], [.92, 1]), rotate: `${interpolate(frame, [142, 310], [1.1, -.4], CLAMP)}deg`, zIndex: 10}}>
      <Sequence from={150} layout="absolute-fill">
        <Video src={staticFile("product-tour.mp4")} muted objectFit="cover" style={{width: "100%", height: "100%", display: "block", filter: "contrast(1.04) saturate(.91)"}} />
      </Sequence>
    </div>
  </AbsoluteFill>;
}

function Screens({frame}: {readonly frame: number}) {
  const a = interpolate(frame, [312, 330, 522, 542], [0, 1, 1, 0], CLAMP);
  const enter = t(frame, 312, 338);
  const games = t(frame, 372, 402, INOUT);
  const sessions = t(frame, 434, 464, INOUT);
  return <AbsoluteFill style={{background: C.paper, opacity: a, overflow: "hidden"}}>
    <Texture />
    <div style={{position: "absolute", left: 0, top: 0, height: "100%", width: 18, background: C.coral}} />
    <VoiceBeat frame={frame} start={313} end={342}>Pick your account.</VoiceBeat>
    <VoiceBeat frame={frame} start={346} end={374}>Pick your game.</VoiceBeat>
    <VoiceBeat frame={frame} start={381} end={414}>See what is running.</VoiceBeat>
    <VoiceBeat frame={frame} start={420} end={458}>Know what is next.</VoiceBeat>
    <VoiceBeat frame={frame} start={468} end={500}>Then <span style={{color: C.coral}}>launch.</span></VoiceBeat>
    <div style={{position: "absolute", left: 140, top: 210, width: 1640, height: 738, overflow: "hidden", borderRadius: 34, border: `4px solid ${C.ink}`, background: C.paper, boxShadow: "18px 24px 0 rgba(16,17,18,.12), 0 36px 90px rgba(16,17,18,.22)", rotate: "-.8deg", scale: interpolate(enter, [0, 1], [.94, 1]), zIndex: 10}}>
      <Img src={staticFile("account-desk.png")} style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "contrast(1.035) saturate(.92)"}} />
      <Img src={staticFile("game-shelf.png")} style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", clipPath: `inset(0 ${100 - games * 100}% 0 0)`, filter: "contrast(1.035) saturate(.92)"}} />
      <Img src={staticFile("session-board.png")} style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", clipPath: `inset(0 ${100 - sessions * 100}% 0 0)`, filter: "contrast(1.035) saturate(.92)"}} />
    </div>
    <Cursor frame={frame} start={318} click={338} x={615} y={492} />
  </AbsoluteFill>;
}

function Payoff({frame}: {readonly frame: number}) {
  const a = interpolate(frame, [510, 538], [0, 1], CLAMP);
  const dark = t(frame, 644, 680, INOUT);
  const {fps} = useVideoConfig();
  const logo = spring({frame: frame - 652, fps, config: {damping: 18, stiffness: 145}});
  return <AbsoluteFill style={{background: C.coral, opacity: a, overflow: "hidden"}}>
    <Texture />
    <Headline frame={frame} start={520} end={592} x={92} y={184} size={200} color={C.white}>More game<span style={{color: C.ink}}>.</span></Headline>
    <Headline frame={frame} start={548} end={606} x={92} y={410} size={200}>Less juggling<span style={{color: C.white}}>.</span></Headline>
    <VoiceBeat frame={frame} start={570} end={642} x={94} y={808} size={54} color={C.ink}>Perfect for <span style={{color: C.white}}>multi-account orchestration.</span></VoiceBeat>
    <div style={{position: "absolute", left: interpolate(dark, [0, 1], [820, -300]), top: interpolate(dark, [0, 1], [430, -500]), width: interpolate(dark, [0, 1], [250, 2500]), height: interpolate(dark, [0, 1], [160, 2100]), borderRadius: "50%", background: C.ink, scale: interpolate(dark, [0, 1], [.1, 1]), zIndex: 10}} />
    <div style={{position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: dark * logo, zIndex: 20}}>
      <Img src={staticFile("virgue-icon.png")} style={{width: 126, height: 126, objectFit: "contain", display: "block", scale: interpolate(logo, [0, 1], [.75, 1])}} />
      <div style={{marginTop: 24, color: C.white, fontFamily: FONT, fontSize: 148, lineHeight: .82, fontWeight: 700, letterSpacing: "-.1em"}}>Virgue.</div>
      <div style={{marginTop: 40, color: C.coral, fontFamily: FONT, fontSize: 32, fontWeight: 600, letterSpacing: "-.05em"}}>Roblox Account Manager</div>
    </div>
  </AbsoluteFill>;
}

export const CinematicProductFilm: React.FC = () => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{background: C.ink, overflow: "hidden"}}>
    <Hook frame={frame} />
    <Tour frame={frame} />
    <Screens frame={frame} />
    <Payoff frame={frame} />
  </AbsoluteFill>;
};
