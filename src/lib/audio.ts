// Pre-generated audio (Piper TTS at build time). Fallback: browser speechSynthesis vi-VN.
export function audioSources(id: string): { src: string; type: string }[] {
  return [
    { src: `/audio/vi/${id}.ogg`, type: 'audio/ogg; codecs=opus' },
    { src: `/audio/vi/${id}.mp3`, type: 'audio/mpeg' },
  ];
}

export function speakFallback(text: string) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
