import {readFile} from "node:fs/promises";

export async function configureEnvironment(env=process.env) {
  if(env.POSTGRES_PASSWORD_FILE) {
  const password=(await readFile(env.POSTGRES_PASSWORD_FILE,"utf8")).trim();
  if(password.length<32)throw new Error("Invalid database secret");
  // URL encoding supports random passwords without shell or connection-string injection.
  env.DATABASE_URL=`postgresql://${encodeURIComponent(env.POSTGRES_USER??"seatback")}:${encodeURIComponent(password)}@${env.POSTGRES_HOST??"db"}:5432/${encodeURIComponent(env.POSTGRES_DB??"seatback")}`;
  } else {
    if(!env.DATABASE_URL)throw new Error("Database configuration required");
    const url=new URL(env.DATABASE_URL);
    if(!["postgres:","postgresql:"].includes(url.protocol))throw new Error("Invalid database protocol");
  }
  if(env.SESSION_SECRET_FILE)env.SESSION_SECRET=(await readFile(env.SESSION_SECRET_FILE,"utf8")).trim();
  if(env.ACCESS_CODE_PEPPER_FILE)env.ACCESS_CODE_PEPPER=(await readFile(env.ACCESS_CODE_PEPPER_FILE,"utf8")).trim();
}
