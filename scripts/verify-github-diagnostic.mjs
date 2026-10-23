/** Diagnostics must distinguish actionable failures without exposing secrets. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { diagnoseGithub } from './diagnose-github-contributions.mjs';

const token=`github_pat_${randomBytes(32).toString('hex')}`,username='GGGxsb';
const environment={GITHUB_CONTRIBUTIONS_TOKEN:token,GITHUB_CONTRIBUTIONS_USERNAME:username};
const run=fetcher=>diagnoseGithub({environment,fetcher});
function safe(result,code){assert.equal(result.code,code);assert.ok(!JSON.stringify(result).includes(token));return result;}
const never=async()=>assert.fail('A configuration failure must not contact GitHub');
safe(await diagnoseGithub({environment:{},fetcher:never}),'missing_token');
safe(await diagnoseGithub({environment:{...environment,GITHUB_CONTRIBUTIONS_USERNAME:'https://github.com/GGGxsb'},fetcher:never}),'missing_username');
safe(await diagnoseGithub({environment:{...environment,GITHUB_CONTRIBUTIONS_TOKEN:`"${token}"`},fetcher:never}),'invalid_token_format');
safe(await run(async()=>new Response(token,{status:401})),'invalid_token');
safe(await run(async()=>new Response(token,{status:403})),'forbidden');
safe(await run(async()=>new Response(token,{status:403,headers:{'x-ratelimit-remaining':'0'}})),'rate_limited');
safe(await run(async()=>new Response(token,{status:429})),'rate_limited');
safe(await run(async()=>new Response(token,{status:502})),'upstream_error');
for(const [type,code] of [['NOT_FOUND','user_not_found'],['INSUFFICIENT_SCOPES','forbidden'],['RATE_LIMITED','rate_limited'],['OTHER','upstream_error']])safe(await run(async()=>Response.json({errors:[{type,message:token}]})),code);
safe(await run(async()=>{throw new DOMException(token,'TimeoutError');}),'timeout');
const reset=safe(await run(async()=>{throw new Error(token,{cause:{code:'ECONNRESET',message:token}});}),'network_error');assert.equal(reset.networkCode,'ECONNRESET');
assert.equal(safe(await run(async()=>new Response(JSON.stringify({secret:token}))),'invalid_response').reason,'missing_user');
assert.equal(safe(await run(async()=>new Response('x'.repeat(140*1024))),'invalid_response').reason,'body_too_large');
assert.equal(safe(await run(async()=>new Response(`<html>${token}</html>`,{headers:{'content-type':'text/html'}})),'invalid_response').reason,'invalid_json');
assert.equal(safe(await run(async()=>Response.json(null)),'invalid_response').reason,'invalid_json_root');
console.log('PASS configuration, authentication, permission, rate limit, timeout, network and malformed-data failures remain distinct without exposing credentials or raw upstream errors');

let calls=0;
const good=async(url,options)=>{
  calls++;assert.equal(url,'https://api.github.com/graphql');assert.equal(options.headers.Authorization,`Bearer ${token}`);assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).variables.login,username);
  return Response.json({data:{user:{login:username,contributionsCollection:{contributionCalendar:{totalContributions:3,weeks:[{contributionDays:[{date:'2026-10-23',contributionCount:1,contributionLevel:'FIRST_QUARTILE'},{date:'2026-10-24',contributionCount:2,contributionLevel:'SECOND_QUARTILE'}]}]}}}}});
};
const result=safe(await run(good),'success');assert.equal(result.days,2);assert.equal(result.totalContributions,3);assert.equal(calls,1);
const profile=safe(await diagnoseGithub({environment:{GITHUB_CONTRIBUTIONS_TOKEN:token},profile:'https://github.com/GGGxsb/',fetcher:good}),'success');assert.equal(profile.username,username);
const command=spawnSync(process.execPath,['--input-type=module'],{input:readFileSync(new URL('./diagnose-github-contributions.mjs',import.meta.url),'utf8'),encoding:'utf8',env:{...process.env,GITHUB_CONTRIBUTIONS_TOKEN:'',GITHUB_CONTRIBUTIONS_USERNAME:username}});
assert.equal(command.status,1);safe(JSON.parse(command.stdout),'missing_token');assert.ok(!command.stderr.includes(token));
console.log('PASS diagnostics use the exact fixed GitHub endpoint and configured account; the script also runs by piping into an existing container without rebuilding it');
