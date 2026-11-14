export function createManifest({ version, description }) {
  return {
    manifest_version: 3,
    name: 'Pangram Solver',
    version,
    description,
    action: {
      default_title: 'Pangram Solver',
      default_popup: 'popup.html',
    },
    content_security_policy: {
      extension_pages: [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    },
  };
}
