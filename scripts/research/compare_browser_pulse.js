async function comparePulse({ fps, ppg }) {
  const [
    { createTracker },
    { averageSkin, regionPolygons, headMotion },
    { estimate, RPPG, spectralPeak, bandpass, detrend },
  ] = await Promise.all([
    import('/src/camera/face/faceModel.ts'),
    import('/src/camera/pulse/skinRegions.ts'),
    import('/src/camera/pulse/rppg.ts'),
  ])
  const tracker = await createTracker('VIDEO')
  const video = document.createElement('video')
  const url = URL.createObjectURL(document.querySelector('input').files[0])
  const samples = []
  try {
    video.muted = true
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve
      video.onerror = reject
      video.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 120
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    let previous
    let accepted = 0
    for (let frame = 0; frame < ppg.length; frame++) {
      const t = (frame + 0.5) / fps
      if (t >= video.duration) break
      await new Promise((resolve) => {
        video.onseeked = resolve
        video.currentTime = t
      })
      const timeMs = (frame * 1000) / fps
      const points = tracker.detectForVideo(video, timeMs).faceLandmarks[0]
      if (!points) continue
      const moved = previous && headMotion(previous, points) > 0.012
      previous = points
      if (moved) continue
      ctx.drawImage(video, 0, 0, 160, 120)
      const rgba = ctx.getImageData(0, 0, 160, 120).data
      const color = averageSkin(rgba, 160, 120, Object.values(regionPolygons(points, 160, 120)))
      if (!color) continue
      if (samples.length && timeMs - samples.at(-1).t > 1000) samples.length = 0
      samples.push({ t: timeMs, r: color.r, g: color.g, b: color.b })
      accepted++
    }
    const last = samples.at(-1)?.t
    if (last === undefined) throw new Error('No valid skin samples.')
    const recent = samples.filter((s) => last - s.t <= 12000)
    const end = Math.round((last * fps) / 1000) + 1
    const reference = Float64Array.from(ppg.slice(Math.max(0, end - Math.round(10 * fps)), end))
    const contact = spectralPeak(bandpass(detrend(reference), fps), fps)
    const result = { accepted, frames: ppg.length, contact: contact && (contact.hz * 60).toFixed(1) }
    for (const name of ['pos', 'chrom']) {
      const e = estimate(recent, name)
      result[name] = {
        bpm: e.bpm?.toFixed(1),
        quality: e.quality.toFixed(2),
        shown: e.bpm !== null && e.seconds >= RPPG.warmupSeconds && e.quality >= RPPG.qualityThreshold,
      }
    }
    return result
  } finally {
    tracker.close()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
