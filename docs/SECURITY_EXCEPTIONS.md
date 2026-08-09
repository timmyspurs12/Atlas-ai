# Temporary security exceptions

Security exceptions are narrow, time-limited, reviewed in CI, and are not permission to ignore unrelated vulnerabilities.

## `image-size` via Expo/Metro

- Advisories: `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq`
- Severity: High (availability/denial of service)
- Affected resolved package: `image-size@1.2.1`
- Dependency path: Expo/React Native → Metro → `image-size`
- Direct dependency: No
- Runtime API dependency: No
- Expiration: **2026-11-01**
- Upstream tracking: <https://github.com/image-size/image-size/pull/439>

### Exposure analysis

Metro uses `image-size` while bundling trusted repository assets. The Atlas API does not call Metro and does not pass user-controlled uploads to `image-size`. Current upload flows do not accept ICNS, JXL, or HEIF for server-side dimension parsing. Therefore, the reported remote denial-of-service path is not exposed by the production API.

### Compensating controls

1. Only repository-controlled PNG/JPEG assets are processed by Metro in CI.
2. User media is not processed by Metro.
3. API content type, size, and extension allowlists remain mandatory before media processing is enabled.
4. Media metadata processing must run outside the API event loop with a timeout when introduced.
5. CI allows only the two exact advisory URLs and their transitive dependency chain; every other high or critical advisory still fails the build.
6. The exception automatically fails CI after its expiration date.

### Resolution plan

Upgrade Expo/Metro or override `image-size` only after a patched, compatible release is available and Expo Doctor passes. Do not use `npm audit fix --force`, because the proposed remediation downgrades Expo and React Native across incompatible major versions.
