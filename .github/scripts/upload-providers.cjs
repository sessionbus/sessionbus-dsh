"use strict";
const LEGACY_UPLOAD_PROVIDER = "@antst/dsh-file-uploads-none";
// The standalone operator checker carries one equality-tested copy.
const UPLOAD_PROVIDER_MODULES = Object.freeze([
  LEGACY_UPLOAD_PROVIDER,
  "@sessionbus/dsh/file-uploads-none",
  "@deepseek-ai/dsh-client-file-upload",
]);
module.exports = { LEGACY_UPLOAD_PROVIDER, UPLOAD_PROVIDER_MODULES };
