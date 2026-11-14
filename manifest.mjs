export const icons = Object.fromEntries([16, 32, 48, 128]
  .map(size => [size, `icons/icon-${size}.png`]));

export function createManifest({ version, description }) {
  return {
    manifest_version: 3,
    name: 'Pangram Solver',
    version,
    description,
    icons,
    action: {
      default_title: 'Pangram Solver',
      default_popup: 'popup.html',
      default_icon: { 16: icons[16], 32: icons[32] },
    },
    content_security_policy: {
      extension_pages: [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  };
}
