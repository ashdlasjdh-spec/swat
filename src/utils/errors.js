/**
 * Turn any thrown error (axios / noblox / generic) into a short human message.
 */
function humanize(err) {
  const msg =
    err?.response?.data?.errors?.[0]?.message ||
    err?.response?.data?.message ||
    err?.response?.statusText ||
    err?.message ||
    'Unknown error';
  return `\`${msg}\``;
}

module.exports = { humanize };
