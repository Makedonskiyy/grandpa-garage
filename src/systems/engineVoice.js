// A four-stroke inline six fires three times per crank revolution.
export function createEngineVoice(context, destination, build = {}) {
  const turbo = build.engine === 'engine_turbo';
  const tuned = build.engine === 'engine_tuned';
  const pipe =
    build.exhaust === 'exhaust_straight' ? 1 : build.exhaust === 'exhaust_sport' ? 0.55 : 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.55;
  const output = context.createGain();
  output.gain.value = 0;
  filter.connect(output);
  output.connect(destination);
  const sources = [];
  const gains = [];
  function oscillator(type, gain, target) {
    const osc = context.createOscillator();
    osc.type = type;
    const level = context.createGain();
    level.gain.value = gain;
    osc.connect(level);
    level.connect(target);
    sources.push(osc);
    gains.push(level);
    osc.start();
    return osc;
  }
  const exhaust = oscillator('sine', 0.65, filter);
  const harmonics = Float32Array.from([
    0,
    1,
    0.53,
    0.32,
    0.24 + pipe * 0.18,
    0.16,
    0.13,
    0.09,
    0.06,
    0.04,
  ]);
  exhaust.setPeriodicWave(
    context.createPeriodicWave(new Float32Array(harmonics.length), harmonics),
  );
  const crank = oscillator('triangle', turbo ? 0.26 : tuned ? 0.21 : 0.15, filter);
  const whistle = turbo ? oscillator('sine', 0, output) : null;
  const hiss = context.createBufferSource();
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  hiss.buffer = buffer;
  hiss.loop = true;
  const intake = context.createBiquadFilter();
  intake.type = 'bandpass';
  intake.Q.value = 0.8;
  const air = context.createGain();
  air.gain.value = 0;
  hiss.connect(intake);
  intake.connect(air);
  air.connect(output);
  hiss.start();
  let lastBoost = 0;
  let stopped = false;
  return {
    update(run, input = {}) {
      if (stopped) return;
      const rpm = Math.max(500, run.rpm);
      const rev = Math.min(1, rpm / run.stats.redline);
      const gas = Math.min(1, Math.max(0, input.gas ?? 0));
      const load = gas * (run.shiftTimer > 0 ? 0.1 : 1) * (run.limiter ? 0.55 : 1);
      const overrun = run.gear > 0 ? rev * (1 - load) : 0;
      const boost = Math.max(0, (rpm - 2800) / 4500) * load;
      const set = (param, value, tau = 0.035) =>
        param.setTargetAtTime(value, context.currentTime, tau);
      set(exhaust.frequency, rpm / 20);
      set(crank.frequency, rpm / 60);
      set(
        filter.frequency,
        300 + 420 * rev + load * (1050 + 1100 * pipe + (tuned ? 450 : 0)) + 350 * pipe,
      );
      const release = turbo && lastBoost > 0.2 && boost < lastBoost * 0.5;
      if (release) air.gain.setValueAtTime(0.18 + lastBoost * 0.14, context.currentTime);
      lastBoost = boost;
      set(intake.frequency, 580 + 1900 * rev);
      set(
        air.gain,
        0.012 +
          load * (build.intake === 'intake_cold' ? 0.21 : build.intake ? 0.16 : 0.1) +
          overrun * 0.035,
        turbo ? 0.1 : 0.035,
      );
      set(output.gain, (0.12 + load * 0.17 + overrun * 0.07) * (1 + pipe * 0.25));
      if (whistle) {
        set(whistle.frequency, 1400 + boost * 2600, 0.16);
        set(gains[2].gain, boost * 0.065, 0.12);
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      output.gain.cancelScheduledValues(context.currentTime);
      output.gain.setTargetAtTime(0, context.currentTime, 0.008);
      for (const source of [...sources, hiss]) {
        source.onended = () => source.disconnect();
        source.stop(context.currentTime + 0.06);
      }
    },
  };
}
