/**
 * WPS 渠道诊断输出。Cordis logger 通常不会打到 `dsh web` 终端；
 * 错误始终 console 输出；详细流式轨迹需 DSH_WPS_DEBUG=1。
 */
export function wpsDebugEnabled() {
  const value = process.env.DSH_WPS_DEBUG;
  return value === '1' || value === 'true' || value === 'yes';
}

export function wpsTrace(message, details) {
  if (!wpsDebugEnabled()) return;
  if (details !== undefined) {
    console.warn('[dsh-wps]', message, details);
    return;
  }
  console.warn('[dsh-wps]', message);
}

export function wpsLogError(message, error) {
  console.warn('[dsh-wps]', message, error);
}
