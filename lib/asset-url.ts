// Relative to the installation root: works at / and /repository-name/.
export function assetUrl(path:string) {
  return new URL(path.replace(/^\//,""),new URL(".",document.baseURI)).href;
}
