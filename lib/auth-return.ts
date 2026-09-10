export function safeReturn(value:unknown){return typeof value==="string"&&value.startsWith("/")&&!value.startsWith("//")&&!value.includes("\\")&&!/[\r\n]/.test(value)?value:"/";}
