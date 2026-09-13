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

/**
 * A compact, SECRET-FREE view of an error for logging. A raw axios error
 * carries `config.headers` (Cookie + x-api-key) — never console.error(err)
 * those directly; log sanitizeError(err) instead.
 */
function sanitizeError(err) {
  if (!err || typeof err !== 'object') return err;
  if (err.isAxiosError || err.config) {
    return {
      message: err.message,
      method: err.config?.method,
      // Path only — strip any query string that might carry identifiers.
      url: String(err.config?.url || '').split('?')[0],
      status: err.response?.status,
      data: err.response?.data,
    };
  }
  return { message: err.message, stack: err.stack };
}

module.exports = { humanize, sanitizeError };
