import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const parse=(path)=>Object.fromEntries(fs.readFileSync(path,"utf8").split(/\r?\n/).filter(Boolean).map((line)=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1)]}));
const env=parse(".env.local"),users=parse(".env.rls-test");
const make=()=>createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const a=make(),b=make(),anon=make();
const login=async(c,key)=>{const r=await c.auth.signInWithPassword({email:users[`POURAGENDA_TEST_USER_${key}_EMAIL`],password:users[`POURAGENDA_TEST_USER_${key}_PASSWORD`]});if(r.error)throw new Error("Test sign-in failed.");return r.data.user.id};
const checks={owner_read:true,cross_read_blocked:false,cross_update_blocked:false,cross_delete_blocked:false,anonymous_denied:false,no_sensitive_payload_columns:false,cleanup:false};
let appointmentId;
try{
 const aId=await login(a,"A");await login(b,"B");const category=(await a.from("categories").select("id").limit(1).single()).data;
 const start=new Date(Date.now()+864e5),end=new Date(start.getTime()+3600e3);
 const appointment=await a.from("appointments").insert({user_id:aId,category_id:category.id,title:`Activity ${randomUUID()}`,kind:"personal",starts_at:start.toISOString(),ends_at:end.toISOString(),intended_local_start:start.toISOString().slice(0,19).replace("T"," "),intended_local_end:end.toISOString().slice(0,19).replace("T"," "),timezone:"UTC",all_day:false}).select("id").single();
 appointmentId=appointment.data.id;
 const activity=await a.from("appointment_activity").insert({user_id:aId,appointment_id:appointmentId,action:"share_created"}).select("*").single();
 const [crossRead,crossUpdate,crossDelete]=await Promise.all([
  b.from("appointment_activity").select("id").eq("id",activity.data.id),
  b.from("appointment_activity").update({action:"share_revoked"}).eq("id",activity.data.id).select("id"),
  b.from("appointment_activity").delete().eq("id",activity.data.id).select("id"),
 ]);
 checks.owner_read=!activity.error&&activity.data.action==="share_created"&&Boolean(activity.data.occurred_at);
 checks.cross_read_blocked=!crossRead.error&&crossRead.data.length===0;
 checks.cross_update_blocked=!crossUpdate.error&&crossUpdate.data.length===0;
 checks.cross_delete_blocked=!crossDelete.error&&crossDelete.data.length===0;
 checks.anonymous_denied=Boolean((await anon.from("appointment_activity").select("id").limit(1)).error);
 checks.no_sensitive_payload_columns=!["password","token","token_hash","private_notes"].some((key)=>key in activity.data);
}finally{
 if(appointmentId)await a.from("appointments").delete().eq("id",appointmentId);
 checks.cleanup=!appointmentId||(await a.from("appointment_activity").select("id").eq("appointment_id",appointmentId)).data.length===0;
 await Promise.all([a.auth.signOut(),b.auth.signOut(),anon.auth.signOut()]);
}
console.log(JSON.stringify(checks));if(Object.values(checks).some((value)=>!value))process.exit(1);
