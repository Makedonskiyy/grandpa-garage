import { audio } from './AudioManager.js';
import { onSettingsChange } from './settings.js';
import { createTireVoice } from './tireVoice.js';

export class DriveSounds {
  constructor(scene, tire) {
    const sound = scene.sound;
    if (sound?.context && sound.destination) {
      this.output = sound.context.createGain();
      this.output.connect(sound.destination);
      this.voice = createTireVoice(sound.context, this.output, tire);
    }
    this.applyVolume = () => {
      const level = audio.sfxLevel();
      if (this.output) this.output.gain.value = level;
    };
    this.applyVolume();
    this.unsubscribe = onSettingsChange(this.applyVolume);
    scene.events.once('shutdown', () => this.stop());
  }

  update(run, input, surface) {
    this.voice?.update(run, input, surface);
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.voice?.stop();
    this.voice = null;
    this.output?.disconnect();
    this.output = null;
  }
}
