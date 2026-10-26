// A narrow chat dialect: Chinese strong text may end in punctuation next to prose.
// Keep it in a private Marked instance; code, escapes and ordinary Markdown stay native.
export function cjkStrongExtension() {
  return {
    extensions: [{
      name: 'cjkStrong',
      level: 'inline',
      start(source) { return source.indexOf('**') },
      tokenizer(source) {
        if (this.lexer.state.inRawBlock) return
        const match = /^\*\*([^*\r\n]+)\*\*(?!\*)/.exec(source)
        if (!match || match[1] !== match[1].trim() || !/\p{Script=Han}/u.test(match[1])) return
        return {
          type: 'strong',
          raw: match[0],
          text: match[1],
          tokens: this.lexer.inlineTokens(match[1]),
        }
      },
    }],
  }
}
