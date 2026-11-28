import { effectiveVolume, onSettingsChange } from './settings.js';

const clips = import.meta.glob('../assets/voice/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
let playing;

export function stopVoice() {
  playing?.pause();
  playing = null;
}

export function playVoice(key) {
  stopVoice();
  const url = clips[`../assets/voice/${key}.mp3`];
  const volume = effectiveVolume('sfx');
  if (!url || volume === 0) return false;
  const voice = new Audio(url);
  voice.volume = volume;
  playing = voice;
  const release = () => {
    if (playing === voice) playing = null;
  };
  voice.addEventListener('ended', release, { once: true });
  void voice.play().catch(release);
  return true;
}

onSettingsChange(() => {
  if (playing) playing.volume = effectiveVolume('sfx');
});
