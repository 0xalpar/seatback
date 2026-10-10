export class HttpError extends Error {
  constructor(readonly status:number,readonly code:string,message=code) { super(message); }
}
export function ensure(value:unknown,status:number,code:string):asserts value {
  if(!value)throw new HttpError(status,code);
}
