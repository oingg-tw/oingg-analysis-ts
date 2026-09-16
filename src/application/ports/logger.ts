// application 層要記 log 時用的最小介面（pino 的 logger 結構上就滿足）——不直接 import
// infrastructure/logger，由 bootstrap 注入。只放真的用得到的三個等級。
export interface LoggerPort {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}
