// datetime-local inputs use the browser's local timezone, not UTC ISO strings.
export function localDateTime(milliseconds:number):string {
 const d=new Date(milliseconds);
 if(!Number.isFinite(d.getTime()))return '';
 const pad=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function eventSchedule(start:string) {
 const time=new Date(start).getTime();
 return {rule1:localDateTime(time-48*3600000),rule2:localDateTime(time-24*3600000),
  opens:localDateTime(time-3600000),closes:localDateTime(time+3600000),ends:localDateTime(time+7200000)};
}
