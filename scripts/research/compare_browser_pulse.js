async function comparePulse({ fps, ppg }) {
  const [
    { createTracker },
    { averageSkin, regionPolygons, headMotion, PULSE_MOTION_LIMIT },
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
      const moved = previous && headMotion(previous, points) > (PULSE_MOTION_LIMIT ?? 0.012)
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
    // Replay two distinct lighting spectra on the extracted colours. Finger PPG
    // and head tracking stay identical for every perturbation of the same clip.
    const lights = [
      { hz: [1.47, 1.88, 2.13], amplitudes: [0.012, 0.025, 0.05], rgb: [0.7, 1.06, 0.91], phase: 0.5 },
      { hz: [1.09, 1.59, 2.37], amplitudes: [0.016, 0.031, 0.044], rgb: [1.18, 0.79, 0.95], phase: 1.34 },
    ]
    result.illumination = {}
    for (const method of ['pos', 'chrom']) {
      let count = 0,
        shown = 0,
        within5 = 0,
        absoluteError = 0
      for (const light of lights)
        for (const hz of light.hz)
          for (const amplitude of light.amplitudes) {
            const perturbed = recent.map(({ t, r, g, b }) => {
              const angle = (2 * Math.PI * hz * t) / 1000
              const shift = amplitude * (Math.sin(angle + light.phase) + 0.26 * Math.sin(2 * angle))
              return {
                t,
                r: r * (1 + light.rgb[0] * shift),
                g: g * (1 + light.rgb[1] * shift),
                b: b * (1 + light.rgb[2] * shift),
              }
            })
            count++
            const e = estimate(perturbed, method)
            if (!contact || e.bpm === null || e.quality < RPPG.qualityThreshold) continue
            shown++
            const error = Math.abs(e.bpm - contact.hz * 60)
            if (error <= 5) within5++
            absoluteError += error
          }
      result.illumination[method] = {
        count,
        shown,
        within5,
        meanAbsoluteError: shown ? (absoluteError / shown).toFixed(2) : null,
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
