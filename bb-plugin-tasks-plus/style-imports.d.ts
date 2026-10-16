declare module "*.css" {}
declare module "*.md?raw" {
  const source: string;
  export default source;
}
