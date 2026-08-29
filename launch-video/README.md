# Virgue launch trailer

This Remotion project renders a 24-second launch trailer for Virgue's Roblox Account Manager.

The current cut is a motion-design product film: real Account Desk, Game Shelf, and Session Board captures are treated as moving evidence inside a graphic system of hard-edged frames, editorial wipes, parallax, camera crops, route lines, cursor choreography, and a real musical bed. Copy is kept sparse so a later conversational voiceover can lead.

## Preview and render

```powershell
npm run lint
npx remotion studio --no-open
npx remotion render VirgueLaunchTrailer out/virgue-launch-trailer.mp4
```

The final render is [out/virgue-launch-trailer.mp4](out/virgue-launch-trailer.mp4), and the timed read is [voiceover-script.md](voiceover-script.md).

## Add the voiceover later

Copy the recorded file to `public/voiceover.mp3`, then render:

```powershell
npx remotion render VirgueLaunchTrailer out/virgue-launch-trailer-vo.mp4 --props='{"voiceoverSrc":"voiceover.mp3"}'
```

The MP3 is mixed at full level while the music bed stays underneath it.

## Re-record the product footage

With the Electron app running on the remote-debugging port, capture fresh renderer frames and rebuild the product-tour asset:

```powershell
node scripts/record-electron-renderer.mjs out/tour-frames 15 20
ffmpeg -framerate 15 -i "out/tour-frames/frame-%06d.png" -vf "fps=30" -c:v libx264 -pix_fmt yuv420p public/product-tour.mp4
```

## Regenerate the music bed

```powershell
node scripts/generate-music-bed.mjs
```
