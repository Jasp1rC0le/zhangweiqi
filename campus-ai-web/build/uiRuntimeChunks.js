// Keep framework/component initialization out of the application entry chunk.
// Otherwise a shared dialog chunk can import an as-yet uninitialized helper from
// that entry, creating a production-only cycle (Element Plus export-helper).
// Document/OCR engines remain lazy and are deliberately not grouped here.
export const uiRuntimeGroup = {
  name: 'ui-runtime',
  test: /node_modules[\\/](?:vue|vue-router|pinia|element-plus|@vue|@element-plus|@vueuse)[\\/]/,
  includeDependenciesRecursively: true,
}
