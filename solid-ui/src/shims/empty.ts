export default {};

export const existsSync = () => false;
export const mkdirSync = () => undefined;
export const join = (...parts: string[]) => parts.filter(Boolean).join("/");
export const resolve = (...parts: string[]) => parts.filter(Boolean).join("/");
