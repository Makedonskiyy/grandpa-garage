// A four-stroke inline six fires three times per crank revolution.
export function createEngineVoice(context, destination, build = {}) {
  const turbo = build.engine === 'engine_turbo';
  const tuned = build.engine === 'engine_tuned';
  const chip = build.ecu === 'ecu_chip';
  const induction = build.intake === 'intake_cold' ? 1 : build.intake === 'intake_filter' ? 0.5 : 0;
  const pipe =
    build.exhaust === 'exhaust_straight' ? 1 : build.exhaust === 'exhaust_sport' ? 0.55 : 0;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.55;
  const output = context.createGain();
  output.gain.value = 0;
  const ignition = context.createGain();
  filter.connect(ignition);
  ignition.connect(output);
  output.connect(destination);
  const sources = [];

  function oscillator(type, gain, target) {
    const osc = context.createOscillator();
    osc.type = type;
    const level = context.createGain();
    level.gain.value = gain;
    osc.connect(level);
    level.connect(target);
    sources.push(osc);

    osc.start();
    return { osc, level };
  }
  const exhaust = oscillator('sine', 0.65, filter);
  const harmonics = Float32Array.from([
    0,
    1,
    tuned ? 0.92 : turbo ? 0.34 : 0.53,
    (tuned ? 0.67 : 0.32) + pipe * 0.4,
    0.24 + pipe * 0.18,
    0.12 + pipe * 0.42,
    0.13,
    0.09,
    0.06,
    0.04,
  ]);
  exhaust.osc.setPeriodicWave(
    context.createPeriodicWave(new Float32Array(harmonics.length), harmonics),
  );
  const crank = oscillator('triangle', turbo ? 0.48 : tuned ? 0.27 : 0.15, filter);
  const whistle = turbo ? oscillator('sine', 0, output) : null;
  const cut = oscillator('square', 0, ignition.gain);
  cut.osc.frequency.value = chip ? 14 : 8;
  const bark = oscillator('triangle', 0, filter);
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
  const pop = context.createGain();
  pop.gain.value = 0;
  const muffler = context.createBiquadFilter();
  muffler.frequency.value = 950;
  hiss.connect(muffler);
  muffler.connect(pop);
  pop.connect(output);
  const thump = oscillator('sine', 0, output);
  function exhaustPop(time, level) {
    pop.gain.setValueAtTime(level, time);
    pop.gain.setTargetAtTime(0, time, 0.017);
    thump.osc.frequency.setValueAtTime(155, time);
    thump.osc.frequency.exponentialRampToValueAtTime(68, time + 0.055);
    thump.level.gain.setValueAtTime(level * 0.55, time);
    thump.level.gain.setTargetAtTime(0, time, 0.024);
  }
  let boost = 0;
  let lastHeavyLoad = -Infinity;
  let lastTime = context.currentTime;
  let lastPop = -Infinity;
  let stopped = false;
  return {
    update(run, input = {}) {
      if (stopped) return;
      const rpm = Math.max(500, Math.min(run.rpm, run.stats.redline));
      const rev = Math.min(1, rpm / run.stats.redline);
      const gas = Math.min(1, Math.max(0, input.gas ?? 0));
      const load = gas * (run.shiftTimer > 0 ? 0.1 : 1);
      const overrun = run.gear > 0 ? rev * (1 - load) : 0;
      const now = context.currentTime;
      const demand = Math.min(1, Math.max(0, (rpm - 2200) / 3700)) * load;
      if (gas >= 0.78) lastHeavyLoad = now;
      const lifted = gas < 0.38 && now - lastHeavyLoad < 0.24;
      if (lifted) lastHeavyLoad = -Infinity;
      const release = turbo && boost > 0.25 && lifted;
      boost += (demand - boost) * (1 - Math.exp(-(now - lastTime) / 0.22));
      lastTime = now;
      if (rev > 0.7 && lifted && now - lastPop > 0.8) {
        const level = 0.42 + pipe * 0.9;
        exhaustPop(now + 0.025, level);
        exhaustPop(now + 0.16, level * 0.72);
        lastPop = now;
      }

      const set = (param, value, tau = 0.035) =>
        param.setTargetAtTime(value, context.currentTime, tau);
      const limiterLoad = gas * Math.max(0, Math.min(1, (rev - 0.98) / 0.02));
      set(ignition.gain, 1 - limiterLoad * 0.3);
      set(cut.level.gain, limiterLoad * 0.24);
      set(bark.osc.frequency, rpm / 10);
      set(bark.level.gain, load * ((chip ? 0.26 : 0) + induction * 0.15));
      set(exhaust.osc.frequency, rpm / 20);
      set(crank.osc.frequency, rpm / 60);
      set(
        filter.frequency,
        300 + 420 * rev + load * (1050 + 1100 * pipe + (tuned ? 450 : 0)) + 350 * pipe,
      );
      if (release) air.gain.setValueAtTime(0.74, now);
      set(intake.frequency, 480 + rev * (1050 + induction * 1800));
      set(
        air.gain,
        0.012 + load * (0.07 + induction * 0.45) + overrun * 0.035,
        turbo ? 0.1 : 0.035,
      );
      set(output.gain, (0.12 + load * 0.17 + overrun * 0.07) * (1 + pipe * 0.25));
      if (whistle) {
        set(whistle.osc.frequency, 1400 + boost * 2600, 0.16);
        set(whistle.level.gain, boost * 0.13, 0.12);
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
