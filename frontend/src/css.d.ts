// Vite resolves bare CSS imports at build time; TypeScript needs to be told
// they exist so `import "./styles.css"` isn't an error.
declare module "*.css";
