/** Explicit synthetic recognition input for gesture/routing acceptance. Never opens a microphone. */
export function installVoiceInputFixture(windowObject, phrase='明天什么课') {
  class SyntheticRecognition {
    start(){this.ended=false;this.onstart?.();this.timer=setTimeout(()=>{if(!this.ended)this.onresult?.({results:[Object.assign([{transcript:phrase}],{isFinal:true})]})},300)}
    stop(){clearTimeout(this.timer);if(this.ended)return;this.ended=true;this.onresult?.({results:[Object.assign([{transcript:phrase}],{isFinal:true})]});this.onend?.()}
    abort(){this.ended=true;clearTimeout(this.timer)}
  }
  windowObject.SpeechRecognition=SyntheticRecognition
}
