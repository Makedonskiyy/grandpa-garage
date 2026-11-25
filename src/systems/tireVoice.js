// Tread pitch and contact noise level for the fitted tire.
const TREAD = {
  tires_stock: [1, 1],
  tires_studded: [1.45, 1.25],
  tires_mud: [0.68, 1.4],
  tires_sport: [1.14, 0.86],
  tires_slicks: [1.24, 0.66],
};

export function createTireVoice(context, destination, tire) {
  const [pitch, roughness] = TREAD[tire] ?? TREAD.tires_stock;
  const noise = context.createBufferSource();
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  noise.buffer = buffer;
  noise.loop = true;
  const roll = context.createBiquadFilter();
  roll.type = 'lowpass';
  const scrape = context.createBiquadFilter();
  scrape.type = 'bandpass';
  const squeal = context.createOscillator();
  squeal.type = 'triangle';
  function channel(source) {
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(destination);
    return gain;
  }
  noise.connect(roll);
  noise.connect(scrape);
  const rubber = context.createBiquadFilter();
  rubber.type = 'bandpass';
  rubber.Q.value = 1.8;
  noise.connect(rubber);
  const braking = channel(rubber);
  const rolling = channel(roll);
  const scraping = channel(scrape);
  const skidding = channel(squeal);
  noise.start();
  squeal.start();
  let stopped = false;
  return {
    update(run, input, surface) {
      if (stopped) return;
      const loose = ['clay', 'mud', 'ruts', 'deep'].includes(surface);
      const speed = Math.min(1, Math.sqrt(Math.max(0, run.v) / 30));
      const strain = loose ? input.gas * Math.min(1, run.sink + run.stuckTimer / 2.5) : 0;
      const friction = Math.max(run.slip, run.lock ?? 0, speed * input.brake * 0.25);
      const lock = Math.max(0, (run.lock ?? 0) - 0.08) / 0.92;
      const asphaltSlip = loose ? friction : run.slip;
      const deep = surface === 'deep';
      const live = Number(run.green && !run.done);
      function tune(param, value) {
        param.setTargetAtTime(value, context.currentTime, 0.045);
      }
      tune(roll.frequency, (loose ? 320 : 800) * pitch * (0.6 + speed));
      tune(scrape.frequency, (deep ? 220 : loose ? 550 : 1900) * pitch * (0.8 + friction));
      tune(noise.playbackRate, (0.5 + speed + strain * 0.3) * pitch);
      tune(rubber.frequency, (380 + 480 * speed + 160 * lock) * Math.sqrt(pitch));
      tune(braking.gain, loose ? 0 : live * speed * roughness * (0.04 * input.brake + 0.53 * lock));
      tune(squeal.frequency, (540 + 240 * speed + 160 * asphaltSlip) * pitch);
      tune(rolling.gain, live * speed * roughness * (loose ? 0.29 : 0.13));
      tune(scraping.gain, live * roughness * (asphaltSlip * 0.3 + strain * 0.55));
      tune(skidding.gain, loose ? 0 : live * asphaltSlip * asphaltSlip * 0.085);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      noise.stop();
      squeal.stop();
      for (const node of [
        noise,
        squeal,
        roll,
        scrape,
        rubber,
        braking,
        rolling,
        scraping,
        skidding,
      ])
        node.disconnect();
    },
  };
}
