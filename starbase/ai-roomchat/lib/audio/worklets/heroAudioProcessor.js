class HeroAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.config = {
      stretch: 1,
      bypass: true,
      bwe: 0,
    }
    this.queue = []
    this.readCursor = 0
    this.tail = new Float32Array(8)
    this.kernel = new Float32Array([
      -0.085,
      -0.04,
      0,
      0.34,
      0.62,
      0.34,
      0,
      -0.04,
      -0.085,
    ])
    this.port.onmessage = (event) => {
      const data = event.data || {}
      if (typeof data.stretch === 'number' && Number.isFinite(data.stretch)) {
        this.config.stretch = Math.max(0.25, Math.min(4, data.stretch))
      }
      if (typeof data.bypass === 'boolean') {
        this.config.bypass = data.bypass
      }
      if (typeof data.bwe === 'number' && Number.isFinite(data.bwe)) {
        this.config.bwe = Math.max(0, Math.min(1, data.bwe))
      }
    }
  }

  cubicSample(buffer, index) {
    const i0 = Math.floor(index) - 1
    const i1 = i0 + 1
    const i2 = i0 + 2
    const i3 = i0 + 3
    const frac = index - Math.floor(index)

    const sample = (idx) => {
      if (idx < 0) return buffer[0] || 0
      if (idx >= buffer.length) return buffer[buffer.length - 1] || 0
      return buffer[idx]
    }

    const p0 = sample(i0)
    const p1 = sample(i1)
    const p2 = sample(i2)
    const p3 = sample(i3)

    const a = (-0.5 * p0) + (1.5 * p1) - (1.5 * p2) + (0.5 * p3)
    const b = p0 - (2.5 * p1) + (2 * p2) - (0.5 * p3)
    const c = (-0.5 * p0) + (0.5 * p2)
    const d = p1

    return ((a * frac * frac * frac) + (b * frac * frac) + (c * frac) + d)
  }

  applyBandwidthExtension(buffer) {
    const amount = this.config.bwe
    if (!amount) return
    const kernel = this.kernel
    const tempLength = this.tail.length + buffer.length
    const work = new Float32Array(tempLength)
    if (this.tail.length) {
      work.set(this.tail)
    }
    work.set(buffer, this.tail.length)
    const kernelSize = kernel.length
    for (let i = 0; i < buffer.length; i += 1) {
      let acc = 0
      for (let k = 0; k < kernelSize; k += 1) {
        acc += kernel[k] * work[i + k]
      }
      buffer[i] = buffer[i] * (1 - amount) + acc * amount
    }
    if (kernelSize > 1) {
      this.tail = work.subarray(work.length - (kernelSize - 1))
    }
  }

  process(inputs, outputs) {
    const input = (inputs[0] && inputs[0][0]) || null
    const output = (outputs[0] && outputs[0][0]) || null
    if (!output) return true

    if (input) {
      for (let i = 0; i < input.length; i += 1) {
        this.queue.push(input[i])
      }
    }

    if (!this.queue.length) {
      output.fill(0)
      return true
    }

    const stretch = this.config.stretch || 1
    const bypass = this.config.bypass || Math.abs(stretch - 1) < 1e-3

    if (bypass) {
      const length = Math.min(output.length, this.queue.length)
      for (let i = 0; i < output.length; i += 1) {
        output[i] = i < length ? this.queue[i] : 0
      }
      this.queue.splice(0, length)
      this.readCursor = 0
    } else {
      for (let i = 0; i < output.length; i += 1) {
        if (this.readCursor + 3 >= this.queue.length) {
          output[i] = 0
        } else {
          output[i] = this.cubicSample(this.queue, this.readCursor)
          this.readCursor += 1 / stretch
        }
      }
      const retain = Math.max(0, Math.floor(this.readCursor) - 4)
      if (retain > 0) {
        this.queue.splice(0, retain)
        this.readCursor -= retain
      }
      if (this.queue.length > 24000) {
        this.queue.splice(0, this.queue.length - 24000)
      }
    }

    this.applyBandwidthExtension(output)
    return true
  }
}

registerProcessor('hero-audio-processor', HeroAudioProcessor)
