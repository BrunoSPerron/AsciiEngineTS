/* eslint-disable no-console */
export const Logger = {
  info: (msg: string) => console.info(`[AsciiEngine] ${msg}`),
  warn: (msg: string, err?: unknown) => console.warn(`[AsciiEngine] ${msg}`, err),
  error: (msg: string, err?: unknown) => console.error(`[AsciiEngine] ${msg}`, err),
}
